<?php
namespace Controllers;

use Core\Database;
use Core\Response;
use Core\Auth;
use Throwable;

class VacancyController {

    private function formatVacancy(array $v, ?array $viewer = null): array {
        $viewerRole = $viewer['role'] ?? null;
        $viewerId = $viewer['id'] ?? null;
        $canManage = ($viewerRole === 'administrador') || 
                     (!empty($viewerId) && !empty($v['recruiter_id']) && $v['recruiter_id'] === $viewerId);

        return [
            'id' => $v['id'],
            'code' => $v['code'] ?? '',
            'title' => $v['title'] ?? '',
            'type' => $v['type'] ?? '',
            'location' => $v['location'] ?? '',
            'faculty' => $v['faculty'] ?? 'Facultad de Educación y Ciencias Sociales',
            'program' => $v['program'] ?? 'Licenciatura en Educación Infantil',
            'campus' => $v['campus'] ?? 'Sede Principal Sincelejo',
            'academicPeriod' => $v['academic_period'] ?? '2026-2',
            'vacanciesCount' => (int)($v['vacancies_count'] ?? 1),
            'modality' => $v['modality'] ?? 'Presencial',
            'description' => $v['description'] ?? '',
            'status' => $v['status'] ?? 'active',
            'openingDate' => $v['opening_date'] ?? null,
            'closingDate' => $v['closing_date'] ?? null,
            'canManage' => $canManage,
            'recruiter' => !empty($v['recruiter_id']) ? [
                'id' => $v['recruiter_id'],
                'name' => $v['recruiter_name'] ?? 'Equipo CECAR',
                'email' => $v['recruiter_email'] ?? ''
            ] : null,
            'recruiterId' => $v['recruiter_id'] ?? null,
            'recruiterName' => $v['recruiter_name'] ?? 'Administrador',
            'applications' => [],
            'applicationsCount' => (int)($v['applications_count'] ?? 0),
            'createdAt' => $v['created_at'] ?? date('Y-m-d H:i:s')
        ];
    }

    public function index(array $input = [], array $params = []): void {
        $user = Auth::user();
        $db = Database::getConnection();

        $query = "SELECT v.*, u.name as recruiter_name, u.email as recruiter_email,
                  (SELECT COUNT(*) FROM applications a WHERE a.vacancy_id = v.id) as applications_count
                  FROM vacancies v
                  LEFT JOIN users u ON v.recruiter_id = u.id
                  WHERE 1=1";
        $sqlParams = [];

        $q = trim($_GET['q'] ?? '');
        if (!empty($q)) {
            $query .= " AND (LOWER(v.title) LIKE ? OR LOWER(v.description) LIKE ?)";
            $sqlParams[] = "%" . strtolower($q) . "%";
            $sqlParams[] = "%" . strtolower($q) . "%";
        }
        $loc = trim($_GET['location'] ?? '');
        if (!empty($loc)) {
            $query .= " AND LOWER(v.location) LIKE ?";
            $sqlParams[] = "%" . strtolower($loc) . "%";
        }
        $status = trim($_GET['status_filter'] ?? ($_GET['status'] ?? ''));
        if (!empty($status)) {
            $query .= " AND v.status = ?";
            $sqlParams[] = $status;
        } elseif ($user && $user['role'] === 'candidato') {
            $query .= " AND v.status IN ('active', 'draft')";
        }
        if (!empty($_GET['faculty'])) {
            $query .= " AND v.faculty = ?";
            $sqlParams[] = $_GET['faculty'];
        }
        if (!empty($_GET['campus'])) {
            $query .= " AND v.campus = ?";
            $sqlParams[] = $_GET['campus'];
        }
        if (!empty($_GET['academic_period'])) {
            $query .= " AND v.academic_period = ?";
            $sqlParams[] = $_GET['academic_period'];
        }

        $query .= " ORDER BY v.created_at DESC";
        $stmt = $db->prepare($query);
        $stmt->execute($sqlParams);
        $items = $stmt->fetchAll() ?: [];

        $formatted = array_map(function($v) use ($user, $db) {
            $data = $this->formatVacancy($v, $user);
            if ($user && $user['role'] === 'candidato') {
                $appStmt = $db->prepare("SELECT id, status FROM applications WHERE vacancy_id = ? AND candidate_id = ? LIMIT 1");
                $appStmt->execute([$v['id'], $user['id']]);
                $myApp = $appStmt->fetch();
                if ($myApp) {
                    $data['applications'] = [
                        ['id' => $myApp['id'], 'email' => $user['email'], 'status' => $myApp['status']]
                    ];
                }
            }
            return $data;
        }, $items);

        Response::json(['items' => $formatted, 'total' => count($formatted), 'page' => 1, 'page_size' => 20]);
    }

    public function show(array $input, array $params): void {
        $id = $params['id'] ?? ($params['vacancy_id'] ?? '');
        $db = Database::getConnection();
        $user = Auth::user();
        $stmt = $db->prepare("SELECT v.*, u.name as recruiter_name, u.email as recruiter_email,
                              (SELECT COUNT(*) FROM applications a WHERE a.vacancy_id = v.id) as applications_count
                              FROM vacancies v
                              LEFT JOIN users u ON v.recruiter_id = u.id
                              WHERE v.id = ? LIMIT 1");
        $stmt->execute([$id]);
        $v = $stmt->fetch();
        if (!$v) {
            Response::error("Convocatoria no encontrada.", 404);
        }
        $data = $this->formatVacancy($v, $user);
        Response::json($data);
    }

    public function create(array $input): void {
        Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $user = Auth::requireUser();
        $db = Database::getConnection();

        $title = trim($input['title'] ?? '');
        $description = trim($input['description'] ?? '');
        $type = trim($input['type'] ?? 'Tiempo Completo');
        $location = trim($input['location'] ?? 'Sincelejo');

        if (empty($title) || empty($description)) {
            Response::error("Título y descripción son obligatorios.", 422);
        }

        $id = Database::uuid();
        $recruiterId = ($user['role'] === 'administrador' && !empty($input['recruiter_id']))
            ? $input['recruiter_id']
            : $user['id'];

        $stmt = $db->prepare("INSERT INTO vacancies (id, title, description, type, location, status, recruiter_id, faculty, program, campus, academic_period, vacancies_count, modality, created_at)
                              VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([
            $id,
            $title,
            $description,
            $type,
            $location,
            $recruiterId,
            $input['faculty'] ?? 'Facultad de Educación y Ciencias Sociales',
            $input['program'] ?? 'Licenciatura en Educación Infantil',
            $input['campus'] ?? 'Sede Principal Sincelejo',
            $input['academic_period'] ?? '2026-2',
            (int)($input['vacancies_count'] ?? 1),
            $input['modality'] ?? 'Presencial'
        ]);

        $newVac = $this->formatVacancy([
            'id' => $id,
            'title' => $title,
            'description' => $description,
            'type' => $type,
            'location' => $location,
            'status' => 'active',
            'recruiter_id' => $recruiterId,
            'recruiter_name' => $user['name'] ?? 'Administrador',
            'recruiter_email' => $user['email'] ?? '',
            'created_at' => date('Y-m-d H:i:s')
        ], $user);

        Response::json($newVac, 201);
    }

    public function delete(array $input, array $params): void {
        Auth::requireRole(['administrador']);
        $id = $params['vacancy_id'] ?? '';
        if (empty($id)) {
            Response::error("ID de vacante requerido.", 422);
        }
        $db = Database::getConnection();

        try {
            $db->beginTransaction();
            // Limpieza en cascada estándar
            try { $db->prepare("DELETE FROM item_reviews WHERE item_id IN (SELECT id FROM application_items WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?))")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM item_supports WHERE item_id IN (SELECT id FROM application_items WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?))")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM application_items WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM application_activities WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM interview_evaluations WHERE interview_id IN (SELECT id FROM interviews WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?))")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM interviews WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM classroom_tests WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM test_results WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM subsanacion_requests WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM occupational_exams WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM employment_bindings WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM hiring_dossiers WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM institutional_integrations WHERE application_id IN (SELECT id FROM applications WHERE vacancy_id = ?)")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM applications WHERE vacancy_id = ?")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM interview_slots WHERE vacancy_id = ?")->execute([$id]); } catch (Throwable) {}
            try { $db->prepare("DELETE FROM selection_work_plans WHERE vacancy_id = ?")->execute([$id]); } catch (Throwable) {}
            $del = $db->prepare("DELETE FROM vacancies WHERE id = ?");
            $del->execute([$id]);
            $db->commit();
            Response::json(['message' => 'Convocatoria eliminada correctamente.']);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            Response::error("Error al eliminar la vacante: " . $e->getMessage(), 500);
        }
    }
}
