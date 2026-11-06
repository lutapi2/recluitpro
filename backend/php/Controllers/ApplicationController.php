<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class ApplicationController {
    public function index(array $input = [], array $routeParams = []): void {
        $user = Auth::requireUser();
        $db = Database::getConnection();

        $query = "SELECT a.*, v.title as vacancy_title, v.code as vacancy_code, v.faculty as vacancy_faculty,
                  v.campus as vacancy_campus, v.program as vacancy_program, u.name as candidate_name, u.email as candidate_email
                  FROM applications a
                  JOIN vacancies v ON a.vacancy_id = v.id
                  JOIN users u ON a.candidate_id = u.id
                  WHERE 1=1";
        $params = [];

        if ($user['role'] === 'candidato') {
            $query .= " AND a.candidate_id = ?";
            $params[] = $user['id'];
        } else {
            $vId = $routeParams['vacancy_id'] ?? ($_GET['vacancy_id'] ?? null);
            if (!empty($vId)) {
                $query .= " AND a.vacancy_id = ?";
                $params[] = $vId;
            }
            if (!empty($_GET['status'])) {
                $query .= " AND a.status = ?";
                $params[] = $_GET['status'];
            }
        }

        $query .= " ORDER BY a.created_at DESC";
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $apps = $stmt->fetchAll();

        $formatted = array_map(function($a) {
            return $this->formatSummary($a);
        }, $apps);

        Response::json(['items' => $formatted, 'total' => count($formatted)]);
    }

    public function mine(): void {
        $user = Auth::requireUser();
        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT a.*, v.title as vacancy_title, v.code as vacancy_code, v.faculty as vacancy_faculty,
                              v.campus as vacancy_campus, v.program as vacancy_program, u.name as candidate_name, u.email as candidate_email
                              FROM applications a
                              JOIN vacancies v ON a.vacancy_id = v.id
                              JOIN users u ON a.candidate_id = u.id
                              WHERE a.candidate_id = ?
                              ORDER BY a.created_at DESC");
        $stmt->execute([$user['id']]);
        $apps = $stmt->fetchAll();

        $formatted = array_map(function($a) {
            return $this->formatSummary($a);
        }, $apps);

        Response::json(['items' => $formatted, 'total' => count($formatted)]);
    }

    public function show(array $input, array $params): void {
        $user = Auth::requireUser();
        $id = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $stmt = $db->prepare("SELECT a.*, v.title as vacancy_title, v.code as vacancy_code, v.faculty as vacancy_faculty,
                              v.campus as vacancy_campus, v.program as vacancy_program, v.type as vacancy_type,
                              u.name as candidate_name, u.email as candidate_email, u.phone as candidate_phone
                              FROM applications a
                              JOIN vacancies v ON a.vacancy_id = v.id
                              JOIN users u ON a.candidate_id = u.id
                              WHERE a.id = ?");
        $stmt->execute([$id]);
        $app = $stmt->fetch();

        if (!$app) {
            Response::error("Postulación no encontrada.", 404);
        }

        if ($user['role'] === 'candidato' && $app['candidate_id'] !== $user['id']) {
            Response::error("No tienes permiso para ver esta postulación.", 403);
        }

        Response::json($this->formatFull($app));
    }

    public function draft(array $input): void {
        $user = Auth::requireRole(['candidato']);
        $vacancyId = $input['vacancy_id'] ?? '';

        if (empty($vacancyId)) {
            Response::error("Se requiere vacancy_id.", 422);
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM applications WHERE vacancy_id = ? AND candidate_id = ?");
        $stmt->execute([$vacancyId, $user['id']]);
        $existing = $stmt->fetch();

        if ($existing) {
            $formatted = $this->formatSummary($existing);
            $formatted['applicationId'] = $existing['id'];
            $formatted['id'] = $existing['id'];
            $formatted['isNew'] = false;
            Response::json($formatted);
            return;
        }

        $appId = Auth::uuid();
        $resumeId = null;
        if (Database::getDriver() === 'sqlite') {
            $resumeId = '00000000-0000-0000-0000-000000000000';
            $db->prepare("INSERT OR IGNORE INTO documents (id, owner_id, original_name, media_type, storage_name, size, created_at) VALUES (?, ?, 'default_cv.pdf', 'application/pdf', 'dummy_storage', 0, CURRENT_TIMESTAMP)")
               ->execute([$resumeId, $user['id']]);
        }

        $ins = $db->prepare("INSERT INTO applications (id, vacancy_id, candidate_id, name, phone, location, resume_id, status, document_status, privacy_consent_at, privacy_consent_version, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, 'borrador', 'pendiente', CURRENT_TIMESTAMP, '3.0', CURRENT_TIMESTAMP)");
        $ins->execute([
            $appId,
            $vacancyId,
            $user['id'],
            $user['name'],
            $user['phone'] ?? '',
            $user['location'] ?? 'Sincelejo, Sucre',
            $resumeId
        ]);

        $st = $db->prepare("SELECT a.*, v.title as vacancy_title, v.code as vacancy_code, v.faculty as vacancy_faculty, v.campus as vacancy_campus, v.program as vacancy_program, u.name as candidate_name, u.email as candidate_email FROM applications a JOIN vacancies v ON a.vacancy_id = v.id JOIN users u ON a.candidate_id = u.id WHERE a.id = ?");
        $st->execute([$appId]);
        $row = $st->fetch();
        $formatted = $this->formatSummary($row);
        $formatted['applicationId'] = $appId;
        $formatted['id'] = $appId;
        $formatted['isNew'] = true;
        Response::json($formatted, 201);
    }

    public function submit(array $input, array $params): void {
        $user = Auth::requireUser();
        $id = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $stmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $stmt->execute([$id]);
        $app = $stmt->fetch();

        if (!$app) Response::error("Postulación no encontrada.", 404);
        if ($user['role'] === 'candidato' && $app['candidate_id'] !== $user['id']) Response::error("No autorizado.", 403);

        $upd = $db->prepare("UPDATE applications SET status = 'enviada', document_status = 'pendiente', submitted_at = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$id]);

        $this->logActivity($id, $user['id'], 'postulacion_enviada', $app['status'], 'enviada', 'Postulación radicada formalmente por el aspirante.');

        Response::json(['message' => 'Postulación enviada exitosamente con constancia digital.']);
    }

    public function preselect(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $id = $params['application_id'] ?? '';
        $justification = $input['justification'] ?? 'Cumple con los requisitos mínimos documentales y perfil.';

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $stmt->execute([$id]);
        $app = $stmt->fetch();
        if (!$app) Response::error("Postulación no encontrada.", 404);

        $upd = $db->prepare("UPDATE applications SET status = 'preseleccionada', document_status = 'conforme' WHERE id = ?");
        $upd->execute([$id]);

        $this->logActivity($id, $user['id'], 'preseleccion', $app['status'], 'preseleccionada', $justification);
        Response::json(['message' => 'Candidato preseleccionado exitosamente.']);
    }

    public function discard(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $id = $params['application_id'] ?? '';
        $reasonId = $input['discard_reason_id'] ?? 'formacion_no_cumple';
        $note = trim($input['note'] ?? 'No cumple con los criterios exigidos en la convocatoria.');

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $stmt->execute([$id]);
        $app = $stmt->fetch();
        if (!$app) Response::error("Postulación no encontrada.", 404);

        $upd = $db->prepare("UPDATE applications SET status = 'no_seleccionada', discard_reason_id = ?, discard_note = ?, final_decision = 'descartado', final_decision_note = ?, final_decision_date = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$reasonId, $note, $note, $id]);

        $this->logActivity($id, $user['id'], 'candidato_descartado', $app['status'], 'no_seleccionada', "Causal: {$reasonId}. Nota: {$note}");
        Response::json(['message' => 'Candidato descartado conforme al catálogo normativo de exclusión CECAR.']);
    }

    public function retire(array $input, array $params): void {
        $user = Auth::requireUser();
        $id = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $stmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $stmt->execute([$id]);
        $app = $stmt->fetch();
        if (!$app) Response::error("Postulación no encontrada.", 404);

        $upd = $db->prepare("UPDATE applications SET status = 'retirada', discard_reason_id = 'desistimiento_voluntario', final_decision = 'retirado', final_decision_date = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$id]);

        $this->logActivity($id, $user['id'], 'desistimiento_voluntario', $app['status'], 'retirada', 'Desistimiento voluntario del aspirante.');
        Response::json(['message' => 'Postulación retirada voluntariamente.']);
    }

    public function internalNote(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'revisor']);
        $id = $params['application_id'] ?? '';
        $note = trim($input['note'] ?? '');
        if (empty($note)) Response::error("La nota no puede estar vacía.", 422);

        $this->logActivity($id, $user['id'], 'nota_interna', null, null, $note, true);
        Response::json(['message' => 'Nota interna registrada en la bitácora.']);
    }

    public function constancia(array $input, array $params): void {
        $user = Auth::requireUser();
        $id = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $stmt = $db->prepare("SELECT a.*, v.title as vacancy_title, v.code as vacancy_code, u.name as candidate_name, u.email as candidate_email
                              FROM applications a JOIN vacancies v ON a.vacancy_id = v.id JOIN users u ON a.candidate_id = u.id WHERE a.id = ?");
        $stmt->execute([$id]);
        $app = $stmt->fetch();
        if (!$app) Response::error("Postulación no encontrada.", 404);

        $html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Constancia de Postulación CECAR</title>
        <style>body{font-family:sans-serif;padding:40px;color:#1e293b}h1{color:#15803d}.box{border:1px solid #cbd5e1;padding:20px;border-radius:8px}</style></head><body>
        <h1>Corporación Universitaria del Caribe - CECAR</h1>
        <h2>Constancia de Radicación Digital de Postulación</h2>
        <div class='box'>
        <p><strong>Radicado:</strong> CECAR-APP-" . substr($app['id'], 0, 8) . "</p>
        <p><strong>Aspirante:</strong> " . htmlspecialchars($app['candidate_name']) . " (" . htmlspecialchars($app['candidate_email']) . ")</p>
        <p><strong>Convocatoria:</strong> " . htmlspecialchars($app['vacancy_code'] ?? '') . " - " . htmlspecialchars($app['vacancy_title']) . "</p>
        <p><strong>Fecha y hora legal:</strong> " . ($app['submitted_at'] ?? $app['created_at']) . "</p>
        <p><strong>Estado:</strong> " . htmlspecialchars($app['status']) . "</p>
        </div><p style='margin-top:40px;font-size:12px;color:#64748b;'>Documento expedido por el Sistema Institucional de Selección de Personal CECAR.</p></body></html>";

        Response::download("constancia_cecar_{$app['id']}.html", $html, "text/html; charset=utf-8");
    }

    public function publicApply(array $input): void {
        $vacancyId = $input['vacancy_id'] ?? '';
        $name = trim($input['name'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $phone = trim($input['phone'] ?? '');

        if (empty($vacancyId) || empty($name) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error("Por favor completa todos los campos requeridos.", 422);
        }

        $db = Database::getConnection();
        // Find or create candidate user
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            $userId = Auth::uuid();
            $hash = password_hash('cecar-' . bin2hex(random_bytes(4)), PASSWORD_DEFAULT);
            $ins = $db->prepare("INSERT INTO users (id, name, email, password_hash, role, phone, email_verified_at, created_at, last_activity_at) VALUES (?, ?, ?, ?, 'candidato', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            $ins->execute([$userId, $name, $email, $hash, $phone]);
        } else {
            $userId = $user['id'];
        }

        // Create or get application
        $st = $db->prepare("SELECT * FROM applications WHERE vacancy_id = ? AND candidate_id = ?");
        $st->execute([$vacancyId, $userId]);
        $existing = $st->fetch();

        if ($existing) {
            Response::json(['message' => 'Ya te encuentras postulado a esta convocatoria.', 'application_id' => $existing['id']]);
            return;
        }

        $appId = Auth::uuid();
        $insApp = $db->prepare("INSERT INTO applications (id, vacancy_id, candidate_id, name, phone, status, document_status, submitted_at, created_at) VALUES (?, ?, ?, ?, ?, 'enviada', 'pendiente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        $insApp->execute([$appId, $vacancyId, $userId, $name, $phone]);

        Response::json(['message' => 'Postulación registrada exitosamente. Revisa tu correo.', 'application_id' => $appId], 201);
    }

    private function logActivity(string $appId, ?string $authorId, string $eventType, ?string $from, ?string $to, string $note, bool $isInternal = false): void {
        $db = Database::getConnection();
        $ins = $db->prepare("INSERT INTO application_activities (id, application_id, author_id, event_type, from_status, to_status, note, is_internal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
        $ins->execute([Auth::uuid(), $appId, $authorId, $eventType, $from, $to, $note, $isInternal ? 1 : 0]);
    }

    private function formatSummary(array $a): array {
        return [
            'id' => $a['id'],
            'vacancyId' => $a['vacancy_id'],
            'vacancyTitle' => $a['vacancy_title'] ?? '',
            'vacancyCode' => $a['vacancy_code'] ?? '',
            'faculty' => $a['vacancy_faculty'] ?? 'Facultad de Educación y Ciencias Sociales',
            'campus' => $a['vacancy_campus'] ?? 'Sede Principal Sincelejo',
            'program' => $a['vacancy_program'] ?? '',
            'candidateId' => $a['candidate_id'],
            'name' => $a['name'],
            'candidateEmail' => $a['candidate_email'] ?? '',
            'status' => $a['status'],
            'documentStatus' => $a['document_status'] ?? 'pendiente',
            'stage' => $a['status'],
            'assignedRecruiterId' => $a['assigned_recruiter_id'] ?? null,
            'subsanacionDeadline' => $a['subsanacion_deadline'] ?? null,
            'discardReasonId' => $a['discard_reason_id'] ?? null,
            'discardNote' => $a['discard_note'] ?? null,
            'createdAt' => $a['created_at'],
            'submittedAt' => $a['submitted_at'] ?? null
        ];
    }

    private function formatFull(array $a): array {
        $db = Database::getConnection();
        $summary = $this->formatSummary($a);

        // Fetch items
        $itemStmt = $db->prepare("SELECT * FROM application_items WHERE application_id = ? ORDER BY created_at ASC");
        $itemStmt->execute([$a['id']]);
        $items = $itemStmt->fetchAll();

        $formattedItems = [];
        foreach ($items as $item) {
            $supStmt = $db->prepare("SELECT id, original_name as name, media_type as type, size, version, created_at as uploaded_at FROM item_supports WHERE item_id = ?");
            $supStmt->execute([$item['id']]);
            $supports = $supStmt->fetchAll();

            $revStmt = $db->prepare("SELECT r.*, u.name as reviewer_name FROM item_reviews r LEFT JOIN users u ON r.reviewer_id = u.id WHERE r.item_id = ? ORDER BY r.reviewed_at DESC");
            $revStmt->execute([$item['id']]);
            $reviews = $revStmt->fetchAll();

            $formattedItems[] = [
                'id' => $item['id'],
                'item_type' => $item['item_type'],
                'section' => $item['section'],
                'title' => $item['title'],
                'data' => json_decode($item['data_json'] ?? '{}', true) ?: [],
                'status' => $item['status'],
                'reviewer_note' => $item['reviewer_note'],
                'is_subsanacion' => !empty($item['is_subsanacion']),
                'version' => (int)$item['version'],
                'supports' => $supports ?: [],
                'reviews' => $reviews ?: []
            ];
        }

        // Subsanaciones
        $subsStmt = $db->prepare("SELECT s.*, u.name as requested_by_name FROM subsanacion_requests s LEFT JOIN users u ON s.requested_by_id = u.id WHERE s.application_id = ? ORDER BY s.requested_at DESC");
        $subsStmt->execute([$a['id']]);
        $subsanaciones = $subsStmt->fetchAll();

        // Activities
        $actStmt = $db->prepare("SELECT act.*, u.name as author_name FROM application_activities act LEFT JOIN users u ON act.author_id = u.id WHERE act.application_id = ? ORDER BY act.created_at ASC");
        $actStmt->execute([$a['id']]);
        $activities = $actStmt->fetchAll();

        // Interview
        $intrStmt = $db->prepare("SELECT * FROM interviews WHERE application_id = ? ORDER BY scheduled_at DESC LIMIT 1");
        $intrStmt->execute([$a['id']]);
        $interview = $intrStmt->fetch();

        // Exam
        $examStmt = $db->prepare("SELECT * FROM occupational_exams WHERE application_id = ? LIMIT 1");
        $examStmt->execute([$a['id']]);
        $exam = $examStmt->fetch();

        // Dossier & Binding
        $dosStmt = $db->prepare("SELECT d.*, b.employee_code, b.start_date, b.status as binding_status FROM hiring_dossiers d LEFT JOIN employment_bindings b ON d.id = b.hiring_id WHERE d.application_id = ? LIMIT 1");
        $dosStmt->execute([$a['id']]);
        $dossier = $dosStmt->fetch();

        $summary['items'] = $formattedItems;
        $summary['subsanaciones'] = $subsanaciones ?: [];
        $summary['activities'] = $activities ?: [];
        $summary['interview'] = $interview ?: null;
        $summary['occupational_exam'] = $exam ?: null;
        $summary['hiring_dossier'] = $dossier ?: null;

        return $summary;
    }
}
