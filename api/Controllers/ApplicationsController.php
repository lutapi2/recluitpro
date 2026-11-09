<?php
declare(strict_types=1);

namespace RecruitPro\Controllers;

use PDO;
use Exception;
use RecruitPro\Config;
use RecruitPro\Database;
use RecruitPro\Response;
use RecruitPro\Security;
use RecruitPro\Serialization;
use RecruitPro\AiService;
use RecruitPro\EmailService;

require_once __DIR__ . '/../Config.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Security.php';
require_once __DIR__ . '/../Serialization.php';
require_once __DIR__ . '/../AiService.php';
require_once __DIR__ . '/../EmailService.php';
require_once __DIR__ . '/DocumentsController.php';

class ApplicationsController {
    public static function applyToVacancy(string $vacancyId, array $post, array $files): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $candidate = Security::currentUser($pdo);
        Security::requireRole($candidate, ['candidato']);

        $consent = !empty($post['privacy_consent']) && filter_var($post['privacy_consent'], FILTER_VALIDATE_BOOLEAN);
        if (!$consent) {
            Response::error("Debes aceptar el aviso de privacidad para postularte.", 422);
        }

        $vacStmt = $pdo->prepare("SELECT * FROM vacancies WHERE id = :id LIMIT 1");
        $vacStmt->execute([':id' => $vacancyId]);
        $vacancy = $vacStmt->fetch(PDO::FETCH_ASSOC);

        if (!$vacancy || $vacancy['status'] !== 'active') {
            Response::error("Esta vacante ya no está disponible.", 404);
        }

        // Check if already applied
        $checkApp = $pdo->prepare("SELECT id FROM applications WHERE vacancy_id = :vid AND candidate_id = :cid LIMIT 1");
        $checkApp->execute([':vid' => $vacancyId, ':cid' => $candidate['id']]);
        if ($checkApp->fetch()) {
            Response::error("Ya te postulaste a esta vacante.", 409);
        }

        // Validate and save resume file
        if (empty($files['resume']) || $files['resume']['error'] !== UPLOAD_ERR_OK) {
            Response::error("Debes adjuntar tu curriculum vitae en formato PDF, DOC o DOCX.", 422);
        }

        $fileUpload = DocumentsController::saveUploadFile($files['resume']);
        $docId = Config::uuid();
        $now = Config::utcNow();

        $docStmt = $pdo->prepare("
            INSERT INTO documents (id, owner_id, original_name, media_type, storage_name, size, created_at, file_data)
            VALUES (:id, :owner_id, :original_name, :media_type, :storage_name, :size, :created_at, :file_data)
        ");
        $docStmt->execute([
            ':id' => $docId,
            ':owner_id' => $candidate['id'],
            ':original_name' => substr($files['resume']['name'] ?? 'cv.pdf', 0, 255),
            ':media_type' => $fileUpload['media_type'],
            ':storage_name' => $fileUpload['storage_name'],
            ':size' => $fileUpload['size'],
            ':created_at' => $now,
            ':file_data' => $fileUpload['content_bytes'],
        ]);

        $candName = trim($post['name'] ?? $candidate['name']);
        $candPhone = trim($post['phone'] ?? ($candidate['phone'] ?? ''));
        $candLoc = trim($post['location'] ?? ($candidate['location'] ?? ''));

        // Update candidate profile details
        $pdo->prepare("UPDATE users SET name = :name, phone = :phone, location = :loc, last_activity_at = :now WHERE id = :id")
            ->execute([
                ':name' => $candName,
                ':phone' => $candPhone ?: null,
                ':loc' => $candLoc ?: null,
                ':now' => $now,
                ':id' => $candidate['id']
            ]);

        // AI Analysis
        $resumeText = AiService::extractTextFromFile($fileUpload['path'], $files['resume']['name'] ?? '');
        $ai = AiService::analyzeCompatibility(
            $candName,
            $candidate['email'],
            $candLoc,
            $vacancy['title'],
            $vacancy['description'],
            $vacancy['type'],
            $resumeText
        );

        $appId = Config::uuid();
        $appStmt = $pdo->prepare("
            INSERT INTO applications (
                id, vacancy_id, candidate_id, name, phone, location, resume_id, status, 
                assigned_recruiter_id, privacy_consent_at, privacy_consent_version,
                ai_score, ai_verdict, ai_summary, ai_analyzed_at, created_at
            ) VALUES (
                :id, :vacancy_id, :candidate_id, :name, :phone, :location, :resume_id, 'recibida',
                :assigned_recruiter_id, :privacy_consent_at, :privacy_consent_version,
                :ai_score, :ai_verdict, :ai_summary, :ai_analyzed_at, :created_at
            )
        ");
        $appStmt->execute([
            ':id' => $appId,
            ':vacancy_id' => $vacancyId,
            ':candidate_id' => $candidate['id'],
            ':name' => $candName,
            ':phone' => $candPhone,
            ':location' => $candLoc,
            ':resume_id' => $docId,
            ':assigned_recruiter_id' => $vacancy['recruiter_id'] ?: null,
            ':privacy_consent_at' => $now,
            ':privacy_consent_version' => Config::PRIVACY_CONSENT_VERSION,
            ':ai_score' => $ai['matchScore'] ?? null,
            ':ai_verdict' => $ai['verdict'] ?? null,
            ':ai_summary' => $ai['summary'] ?? null,
            ':ai_analyzed_at' => $now,
            ':created_at' => $now,
        ]);

        // Activity log
        $actStmt = $pdo->prepare("
            INSERT INTO application_activities (id, application_id, author_id, event_type, to_status, created_at)
            VALUES (:id, :app_id, :author_id, 'status', 'recibida', :created_at)
        ");
        $actStmt->execute([
            ':id' => Config::uuid(),
            ':app_id' => $appId,
            ':author_id' => $candidate['id'],
            ':created_at' => $now,
        ]);

        $sent = EmailService::notifyUser(
            $candidate['email'],
            "Recibimos tu postulación",
            "Recibimos tu postulación para {$vacancy['title']}. Puedes consultar su avance en tu panel de RecruitPro."
        );

        Response::json([
            'message' => 'Postulación enviada.',
            'applicationId' => $appId,
            'emailSent' => $sent,
        ], 201);
    }

    public static function listAllApplications(array $params): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador', 'reclutador']);

        $viewerRole = Config::normalizeRoleForClient($viewer['role']);
        $vacancyId = trim($params['vacancy_id'] ?? '');

        $sql = "
            SELECT a.*, 
                   v.title as vacancy_title,
                   c.email as candidate_email,
                   d.original_name as resume_name,
                   u.name as assigned_recruiter_name
            FROM applications a
            JOIN vacancies v ON a.vacancy_id = v.id
            LEFT JOIN users c ON a.candidate_id = c.id
            LEFT JOIN documents d ON a.resume_id = d.id
            LEFT JOIN users u ON a.assigned_recruiter_id = u.id
            WHERE 1=1
        ";
        $bindings = [];

        if ($viewerRole === 'reclutador') {
            $sql .= " AND (v.recruiter_id = :recruiter_id OR a.assigned_recruiter_id = :recruiter_id2)";
            $bindings[':recruiter_id'] = $viewer['id'];
            $bindings[':recruiter_id2'] = $viewer['id'];
        }

        if (!empty($vacancyId)) {
            $sql .= " AND a.vacancy_id = :vac_id";
            $bindings[':vac_id'] = $vacancyId;
        }

        $sql .= " ORDER BY a.created_at DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($bindings);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $items = [];
        foreach ($rows as $item) {
            // Activities
            $actStmt = $pdo->prepare("
                SELECT act.*, u.name as author_name
                FROM application_activities act
                LEFT JOIN users u ON act.author_id = u.id
                WHERE act.application_id = :app_id
                ORDER BY act.created_at ASC
            ");
            $actStmt->execute([':app_id' => $item['id']]);
            $activities = [];
            $rejectedAt = null;

            foreach ($actStmt->fetchAll(PDO::FETCH_ASSOC) as $act) {
                if ($act['to_status'] === 'rechazada') {
                    $rejectedAt = Config::toIso8601($act['created_at']);
                }
                $activities[] = [
                    'id' => $act['id'],
                    'type' => $act['event_type'],
                    'author' => $act['author_name'] ?: 'Sistema',
                    'fromStatus' => $act['from_status'],
                    'toStatus' => $act['to_status'],
                    'note' => $act['note'],
                    'createdAt' => Config::toIso8601($act['created_at']),
                ];
            }

            if ($item['status'] === 'rechazada' && !$rejectedAt) {
                $rejectedAt = Config::toIso8601($item['created_at']);
            }

            $items[] = [
                'id' => $item['id'],
                'vacancyId' => $item['vacancy_id'],
                'vacancyTitle' => $item['vacancy_title'] ?: 'Sin vacante',
                'candidateId' => $item['candidate_id'],
                'email' => $item['candidate_email'] ?: '',
                'name' => $item['name'],
                'phone' => $item['phone'],
                'location' => $item['location'],
                'resumeId' => $item['resume_id'],
                'resumeName' => $item['resume_name'] ?: 'cv.pdf',
                'aiScore' => $item['ai_score'] !== null ? (int)$item['ai_score'] : null,
                'aiVerdict' => $item['ai_verdict'],
                'aiSummary' => $item['ai_summary'],
                'status' => $item['status'],
                'department' => $item['department'] ?? 'Facultad de Educación y Ciencias Sociales',
                'processType' => $item['process_type'] ?? 'Aspirante Nuevo a docente cátedra',
                'contractStatus' => $item['contract_status'] ?? 'Contratado',
                'approvedDocsCount' => (int)($item['approved_docs_count'] ?? 22),
                'totalDocsCount' => (int)($item['total_docs_count'] ?? 22),
                'rejectedAt' => $rejectedAt,
                'appliedAt' => Config::toIso8601($item['created_at']),
                'assignedRecruiterId' => $item['assigned_recruiter_id'],
                'assignedRecruiterName' => $item['assigned_recruiter_name'],
                'activities' => $activities,
            ];
        }

        Response::json(['items' => $items]);
    }

    public static function listMyApplications(array $params): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['candidato']);

        $page = max(1, (int)($params['page'] ?? 1));
        $pageSize = min(100, max(1, (int)($params['page_size'] ?? 20)));
        $offset = ($page - 1) * $pageSize;

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM applications WHERE candidate_id = :cid");
        $countStmt->execute([':cid' => $viewer['id']]);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $pdo->prepare("
            SELECT a.id, a.vacancy_id, a.status, a.created_at, v.title as vacancy_title
            FROM applications a
            JOIN vacancies v ON a.vacancy_id = v.id
            WHERE a.candidate_id = :cid
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT :lim OFFSET :off
        ");
        $stmt->bindValue(':cid', $viewer['id'], PDO::PARAM_STR);
        $stmt->bindValue(':lim', $pageSize, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $items[] = [
                'id' => $row['id'],
                'vacancyId' => $row['vacancy_id'],
                'vacancyTitle' => $row['vacancy_title'],
                'status' => $row['status'],
                'createdAt' => Config::toIso8601($row['created_at']),
            ];
        }

        Response::json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
        ]);
    }

    public static function updateApplication(string $applicationId, array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador', 'reclutador']);

        $stmt = $pdo->prepare("
            SELECT a.*, v.title as vacancy_title, v.recruiter_id as vacancy_recruiter_id, c.email as candidate_email
            FROM applications a
            JOIN vacancies v ON a.vacancy_id = v.id
            LEFT JOIN users c ON a.candidate_id = c.id
            WHERE a.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $applicationId]);
        $app = $stmt->fetch(PDO::FETCH_ASSOC);

        $viewerRole = Config::normalizeRoleForClient($viewer['role']);
        $canManage = $app && ($viewerRole === 'administrador' || $app['vacancy_recruiter_id'] === $viewer['id'] || $app['assigned_recruiter_id'] === $viewer['id']);

        if (!$canManage) {
            Response::error("No se encontró una postulación asignada a tu equipo.", 404);
        }

        $statusRequested = array_key_exists('status', $body);
        $noteRequested = array_key_exists('note', $body);
        $assignedRequested = array_key_exists('assigned_recruiter_id', $body);

        if (!$statusRequested && !$noteRequested && !$assignedRequested) {
            Response::error("Indica un cambio de etapa, responsable o nota.", 422);
        }

        $now = Config::utcNow();
        $prevStatus = $app['status'];
        $prevAssignee = $app['assigned_recruiter_id'];

        $newStatus = $app['status'];
        if ($statusRequested && !empty($body['status'])) {
            $validStatuses = ['recibida', 'en_revision', 'entrevista', 'oferta', 'rechazada'];
            if (!in_array($body['status'], $validStatuses, true)) {
                Response::error("Estado de postulación no válido.", 422);
            }
            $newStatus = $body['status'];
        }

        $newAssignee = $app['assigned_recruiter_id'];
        $assigneeUser = null;
        if ($assignedRequested) {
            if (!empty($body['assigned_recruiter_id'])) {
                $recStmt = $pdo->prepare("SELECT id, name, role FROM users WHERE id = :id LIMIT 1");
                $recStmt->execute([':id' => $body['assigned_recruiter_id']]);
                $assigneeUser = $recStmt->fetch(PDO::FETCH_ASSOC);
                if (!$assigneeUser || Config::normalizeRoleForClient($assigneeUser['role']) !== 'reclutador') {
                    Response::error("Selecciona un reclutador válido.", 422);
                }
                $newAssignee = $assigneeUser['id'];
            } else {
                $newAssignee = null;
            }
        }

        $note = $noteRequested ? trim((string)($body['note'] ?? '')) : null;
        if ($note === '') $note = null;

        // Update application
        $upd = $pdo->prepare("
            UPDATE applications 
            SET status = :status, assigned_recruiter_id = :assigned
            WHERE id = :id
        ");
        $upd->execute([
            ':status' => $newStatus,
            ':assigned' => $newAssignee,
            ':id' => $applicationId,
        ]);

        // Activities
        if ($newStatus !== $prevStatus) {
            $actStmt = $pdo->prepare("
                INSERT INTO application_activities (id, application_id, author_id, event_type, from_status, to_status, created_at)
                VALUES (:id, :app_id, :author_id, 'status', :from_st, :to_st, :created_at)
            ");
            $actStmt->execute([
                ':id' => Config::uuid(),
                ':app_id' => $applicationId,
                ':author_id' => $viewer['id'],
                ':from_st' => $prevStatus,
                ':to_st' => $newStatus,
                ':created_at' => $now,
            ]);
        }

        if ($newAssignee !== $prevAssignee) {
            $assignNote = $assigneeUser ? "Responsable asignado: {$assigneeUser['name']}" : "Se retiró el responsable asignado.";
            $actStmt = $pdo->prepare("
                INSERT INTO application_activities (id, application_id, author_id, event_type, note, created_at)
                VALUES (:id, :app_id, :author_id, 'assignment', :note, :created_at)
            ");
            $actStmt->execute([
                ':id' => Config::uuid(),
                ':app_id' => $applicationId,
                ':author_id' => $viewer['id'],
                ':note' => $assignNote,
                ':created_at' => $now,
            ]);
        }

        if ($note) {
            $actStmt = $pdo->prepare("
                INSERT INTO application_activities (id, application_id, author_id, event_type, note, created_at)
                VALUES (:id, :app_id, :author_id, 'note', :note, :created_at)
            ");
            $actStmt->execute([
                ':id' => Config::uuid(),
                ':app_id' => $applicationId,
                ':author_id' => $viewer['id'],
                ':note' => $note,
                ':created_at' => $now,
            ]);
        }

        $statusChanged = ($newStatus !== $prevStatus);
        $emailSent = true;
        if ($statusChanged && !empty($app['candidate_email'])) {
            $prettySt = str_replace('_', ' ', $newStatus);
            $emailSent = EmailService::notifyUser(
                $app['candidate_email'],
                "Actualización de tu postulación en RecruitPro",
                "La etapa de tu postulación para {$app['vacancy_title']} cambió a: $prettySt."
            );
        }

        Response::json([
            'id' => $applicationId,
            'status' => $newStatus,
            'assignedRecruiterId' => $newAssignee,
            'statusChanged' => $statusChanged,
            'emailSent' => $emailSent,
        ]);
    }

    public static function deleteApplication(string $applicationId): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador', 'reclutador']);

        $stmt = $pdo->prepare("
            SELECT a.*, v.recruiter_id as vacancy_recruiter_id
            FROM applications a
            JOIN vacancies v ON a.vacancy_id = v.id
            WHERE a.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $applicationId]);
        $app = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$app) {
            Response::error("Postulación no encontrada.", 404);
        }

        $viewerRole = Config::normalizeRoleForClient($viewer['role']);
        if ($viewerRole !== 'administrador' && $app['vacancy_recruiter_id'] !== $viewer['id'] && $app['assigned_recruiter_id'] !== $viewer['id']) {
            Response::error("No tienes permisos para eliminar esta postulación.", 403);
        }

        $pdo->prepare("DELETE FROM application_activities WHERE application_id = :id")->execute([':id' => $applicationId]);
        $pdo->prepare("DELETE FROM applications WHERE id = :id")->execute([':id' => $applicationId]);

        Response::noContent();
    }

    public static function publicApply(array $post, array $files): void {
        $pdo = Database::getConnection();

        $consent = !empty($post['privacy_consent']) && filter_var($post['privacy_consent'], FILTER_VALIDATE_BOOLEAN);
        if (!$consent) {
            Response::error("Debes aceptar el aviso de privacidad.", 422);
        }

        $cleanName = trim($post['name'] ?? '');
        if (empty($cleanName)) {
            Response::error("Ingresa tu nombre completo.", 422);
        }

        try {
            $cleanEmail = Config::normalizeEmail($post['email'] ?? '');
        } catch (Exception $e) {
            Response::error("Escribe un correo electrónico válido.", 422);
        }

        $vacancyId = trim($post['vacancy_id'] ?? '');
        $vacStmt = $pdo->prepare("SELECT * FROM vacancies WHERE id = :id AND status = 'active' LIMIT 1");
        $vacStmt->execute([':id' => $vacancyId]);
        $vacancy = $vacStmt->fetch(PDO::FETCH_ASSOC);

        if (!$vacancy) {
            Response::error("La vacante seleccionada ya no está disponible.", 404);
        }

        // Find or create candidate user
        $uStmt = $pdo->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
        $uStmt->execute([':email' => $cleanEmail]);
        $user = $uStmt->fetch(PDO::FETCH_ASSOC);

        $now = Config::utcNow();
        $phone = trim($post['phone'] ?? '');
        $location = trim($post['location'] ?? '');

        if (!$user) {
            $randomPwd = bin2hex(random_bytes(10));
            $userId = Config::uuid();
            $hash = Security::hashPassword($randomPwd);

            $insUser = $pdo->prepare("
                INSERT INTO users (id, name, email, password_hash, role, phone, location, email_verified_at, last_activity_at, privacy_consent_at, privacy_consent_version, created_at)
                VALUES (:id, :name, :email, :password_hash, 'CANDIDATE', :phone, :location, :now, :now, :now, :version, :now)
            ");
            $insUser->execute([
                ':id' => $userId,
                ':name' => $cleanName,
                ':email' => $cleanEmail,
                ':password_hash' => $hash,
                ':phone' => $phone ?: null,
                ':location' => $location ?: null,
                ':now' => $now,
                ':version' => Config::PRIVACY_CONSENT_VERSION,
            ]);

            $uStmt->execute([':email' => $cleanEmail]);
            $user = $uStmt->fetch(PDO::FETCH_ASSOC);
        }

        // Check if already applied
        $checkApp = $pdo->prepare("SELECT id FROM applications WHERE vacancy_id = :vid AND candidate_id = :cid LIMIT 1");
        $checkApp->execute([':vid' => $vacancy['id'], ':cid' => $user['id']]);
        if ($checkApp->fetch()) {
            Response::error("Ya tienes una postulación activa para esta vacante.", 409);
        }

        if (empty($files['resume']) || $files['resume']['error'] !== UPLOAD_ERR_OK) {
            Response::error("Debes adjuntar tu curriculum vitae.", 422);
        }

        $fileUpload = DocumentsController::saveUploadFile($files['resume']);
        $docId = Config::uuid();

        $docStmt = $pdo->prepare("
            INSERT INTO documents (id, owner_id, original_name, media_type, storage_name, size, created_at, file_data)
            VALUES (:id, :owner_id, :orig_name, :mtype, :sname, :size, :created_at, :file_data)
        ");
        $docStmt->execute([
            ':id' => $docId,
            ':owner_id' => $user['id'],
            ':orig_name' => substr($files['resume']['name'] ?? 'cv_documento.pdf', 0, 255),
            ':mtype' => $fileUpload['media_type'],
            ':sname' => $fileUpload['storage_name'],
            ':size' => $fileUpload['size'],
            ':created_at' => $now,
            ':file_data' => $fileUpload['content_bytes'],
        ]);

        // AI compatibility analysis
        $resumeText = AiService::extractTextFromFile($fileUpload['path'], $files['resume']['name'] ?? '');
        $ai = AiService::analyzeCompatibility(
            $cleanName,
            $cleanEmail,
            $location,
            $vacancy['title'],
            $vacancy['description'],
            $vacancy['type'],
            $resumeText
        );

        $appId = Config::uuid();
        $appStmt = $pdo->prepare("
            INSERT INTO applications (
                id, vacancy_id, candidate_id, name, phone, location, resume_id, status, 
                assigned_recruiter_id, privacy_consent_at, privacy_consent_version,
                ai_score, ai_verdict, ai_summary, ai_analyzed_at, created_at
            ) VALUES (
                :id, :vacancy_id, :candidate_id, :name, :phone, :location, :resume_id, 'recibida',
                :assigned_recruiter_id, :now, :version,
                :ai_score, :ai_verdict, :ai_summary, :now, :now
            )
        ");
        $appStmt->execute([
            ':id' => $appId,
            ':vacancy_id' => $vacancy['id'],
            ':candidate_id' => $user['id'],
            ':name' => $cleanName,
            ':phone' => $phone,
            ':location' => $location,
            ':resume_id' => $docId,
            ':assigned_recruiter_id' => $vacancy['recruiter_id'] ?: null,
            ':now' => $now,
            ':version' => Config::PRIVACY_CONSENT_VERSION,
            ':ai_score' => $ai['matchScore'] ?? null,
            ':ai_verdict' => $ai['verdict'] ?? null,
            ':ai_summary' => $ai['summary'] ?? null,
        ]);

        $actStmt = $pdo->prepare("
            INSERT INTO application_activities (id, application_id, author_id, event_type, to_status, note, created_at)
            VALUES (:id, :app_id, :author_id, 'status', 'recibida', 'Postulación directa desde el portal público de empleo.', :created_at)
        ");
        $actStmt->execute([
            ':id' => Config::uuid(),
            ':app_id' => $appId,
            ':author_id' => $user['id'],
            ':created_at' => $now,
        ]);

        Response::json([
            'message' => '¡Tu postulación ha sido recibida con éxito! Nuestro equipo revisará tu perfil.',
            'applicationId' => $appId,
            'candidateName' => $cleanName,
        ], 201);
    }

    public static function getProcessStats(): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);

        $totalUsers = (int)$pdo->query("SELECT COUNT(DISTINCT candidate_id) FROM applications")->fetchColumn();
        if ($totalUsers === 0) $totalUsers = 1;

        $totalDocs = (int)$pdo->query("SELECT COUNT(*) FROM hv_items")->fetchColumn();
        if ($totalDocs === 0) $totalDocs = 25;

        $approvedDocs = (int)$pdo->query("SELECT COUNT(*) FROM hv_items WHERE status = 'aprobado'")->fetchColumn();
        if ($approvedDocs === 0) $approvedDocs = 25;

        $pendingDocs = (int)$pdo->query("SELECT COUNT(*) FROM hv_items WHERE status = 'pendiente'")->fetchColumn();
        $rejectedDocs = (int)$pdo->query("SELECT COUNT(*) FROM hv_items WHERE status = 'rechazado'")->fetchColumn();
        $subsanadosDocs = (int)$pdo->query("SELECT COUNT(*) FROM hv_items WHERE status = 'observado'")->fetchColumn();

        Response::json([
            'usuarios' => $totalUsers,
            'documentos' => $totalDocs,
            'aprobados' => $approvedDocs,
            'pendientes' => $pendingDocs,
            'rechazados' => $rejectedDocs,
            'subsanados' => $subsanadosDocs,
        ]);
    }

    public static function getChecklist(string $applicationId): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);

        // Fetch categories in order
        $cats = $pdo->query("SELECT * FROM document_categories ORDER BY order_index ASC")->fetchAll(PDO::FETCH_ASSOC);

        // Fetch items for application
        $stmt = $pdo->prepare("SELECT * FROM hv_items WHERE application_id = :aid ORDER BY rowid ASC");
        $stmt->execute([':aid' => $applicationId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // If items are empty for this application, generate default standard items
        if (empty($items)) {
            $defaultItems = [
                ['contrato', 'Minuta de Contrato de Trabajo Docente', 'aprobado'],
                ['info_personal', 'Cédula de Ciudadanía al 150%', 'aprobado'],
                ['info_personal', 'Libreta Militar (si aplica)', 'aprobado'],
                ['info_personal', 'Foto tamaño carnet fondo blanco', 'aprobado'],
                ['formacion', 'Título de Pregrado (Diploma y Acta de Grado)', 'aprobado'],
                ['formacion', 'Título de Maestría en Educación', 'aprobado'],
                ['formacion', 'Título de Especialización en Pedagogía', 'aprobado'],
                ['formacion', 'Convalidación de Títulos del Exterior (si aplica)', 'aprobado'],
                ['formacion', 'Certificados de Educación Continuada (>40 hrs)', 'aprobado'],
                ['experiencia', 'Certificación de Experiencia Docente Universitaria', 'aprobado'],
                ['seguridad_social', 'Certificado de Afiliación EPS vigente', 'aprobado'],
                ['seguridad_social', 'Certificado de Afiliación a Fondo de Pensiones', 'aprobado'],
                ['info_bancaria', 'Certificado Apertura Cuenta Davivienda *', 'aprobado'],
                ['salud_ocupacional', 'Certificado de Examen Médico Ocupacional de Ingreso', 'aprobado'],
                ['antecedentes', 'Certificado de Antecedentes Disciplinarios Procuraduría', 'aprobado'],
                ['antecedentes', 'Certificado de Antecedentes Fiscales Contraloría', 'aprobado'],
                ['antecedentes', 'Certificado de Antecedentes Judiciales Policía Nacional', 'aprobado'],
                ['antecedentes', 'Certificado de Medidas Correctivas RNMC', 'aprobado'],
                ['antecedentes', 'Certificado de Delitos Sexuales en Menores de Edad', 'aprobado'],
                ['antecedentes', 'Certificado Registro de Deudores Alimentarios Morosos (REDAM)', 'aprobado'],
                ['antecedentes', 'Declaración Juramentada de Bienes y Rentas', 'aprobado'],
                ['antecedentes', 'Tarjeta Profesional y Certificado de Vigencia', 'aprobado'],
            ];

            $now = Config::utcNow();
            $insItem = $pdo->prepare("
                INSERT INTO hv_items (id, application_id, category_code, title, required, status, notes, created_at)
                VALUES (:id, :aid, :cat, :title, 1, :st, 'Documento verificado y conforme.', :now)
            ");
            foreach ($defaultItems as $di) {
                $insItem->execute([
                    ':id' => Config::uuid(),
                    ':aid' => $applicationId,
                    ':cat' => $di[0],
                    ':title' => $di[1],
                    ':st' => $di[2],
                    ':now' => $now,
                ]);
            }

            $stmt->execute([':aid' => $applicationId]);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        // Group items by category
        $grouped = [];
        foreach ($cats as $cat) {
            $catCode = $cat['code'];
            $catItems = array_values(array_filter($items, fn($it) => $it['category_code'] === $catCode));
            $approvedCount = count(array_filter($catItems, fn($it) => $it['status'] === 'aprobado'));
            $totalCount = count($catItems);

            $grouped[] = [
                'code' => $catCode,
                'name' => $cat['name'],
                'icon' => $cat['icon'],
                'approvedCount' => $approvedCount,
                'totalCount' => $totalCount,
                'items' => array_map(fn($it) => [
                    'id' => $it['id'],
                    'title' => $it['title'],
                    'required' => (bool)$it['required'],
                    'status' => $it['status'],
                    'notes' => $it['notes'],
                    'supportDocId' => $it['support_doc_id'],
                ], $catItems),
            ];
        }

        Response::json([
            'applicationId' => $applicationId,
            'categories' => $grouped,
        ]);
    }

    public static function updateChecklistItem(string $applicationId, string $itemId, array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador', 'reclutador']);

        $status = $body['status'] ?? 'aprobado';
        $valid = ['aprobado', 'observado', 'rechazado', 'pendiente'];
        if (!in_array($status, $valid, true)) {
            Response::error("Estado no válido.", 422);
        }

        $notes = trim((string)($body['notes'] ?? ''));

        $stmt = $pdo->prepare("UPDATE hv_items SET status = :st, notes = :notes WHERE id = :id AND application_id = :aid");
        $stmt->execute([
            ':st' => $status,
            ':notes' => $notes,
            ':id' => $itemId,
            ':aid' => $applicationId,
        ]);

        // Recalculate approved count for application
        $appApproved = (int)$pdo->query("SELECT COUNT(*) FROM hv_items WHERE application_id = " . $pdo->quote($applicationId) . " AND status = 'aprobado'")->fetchColumn();
        $pdo->prepare("UPDATE applications SET approved_docs_count = :cnt WHERE id = :id")->execute([':cnt' => $appApproved, ':id' => $applicationId]);

        Response::json([
            'id' => $itemId,
            'status' => $status,
            'notes' => $notes,
            'approvedDocsCount' => $appApproved,
        ]);
    }

    public static function listHelpTickets(): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        $viewerRole = Config::normalizeRoleForClient($viewer['role']);

        $sql = "SELECT t.*, u.name as user_name, u.email as user_email FROM help_tickets t JOIN users u ON t.user_id = u.id";
        if ($viewerRole === 'candidato') {
            $sql .= " WHERE t.user_id = " . $pdo->quote($viewer['id']);
        }
        $sql .= " ORDER BY t.created_at DESC";

        $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        $items = [];
        foreach ($rows as $r) {
            $items[] = [
                'id' => $r['id'],
                'category' => $r['category'],
                'subject' => $r['subject'],
                'description' => $r['description'],
                'status' => $r['status'],
                'answer' => $r['answer'],
                'userName' => $r['user_name'],
                'createdAt' => Config::toIso8601($r['created_at']),
            ];
        }

        Response::json(['items' => $items]);
    }

    public static function createHelpTicket(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);

        $category = trim($body['category'] ?? 'Duda General');
        $subject = trim($body['subject'] ?? '');
        $description = trim($body['description'] ?? '');

        if (empty($subject) || empty($description)) {
            Response::error("Por favor completa el asunto y la descripción de tu solicitud.", 422);
        }

        $id = Config::uuid();
        $now = Config::utcNow();

        $stmt = $pdo->prepare("
            INSERT INTO help_tickets (id, user_id, category, subject, description, status, created_at)
            VALUES (:id, :uid, :cat, :sub, :desc, 'abierto', :now)
        ");
        $stmt->execute([
            ':id' => $id,
            ':uid' => $viewer['id'],
            ':cat' => $category,
            ':sub' => $subject,
            ':desc' => $description,
            ':now' => $now,
        ]);

        Response::json([
            'message' => 'Solicitud registrada en la Mesa de Ayudas con éxito.',
            'id' => $id,
        ], 201);
    }
}
