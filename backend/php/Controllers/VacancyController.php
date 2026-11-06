<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class VacancyController {
    public function index(): void {
        $user = Auth::requireUser();
        $db = Database::getConnection();

        $query = "SELECT v.*, u.name as recruiter_name, u.email as recruiter_email,
                  (SELECT COUNT(*) FROM applications a WHERE a.vacancy_id = v.id) as applications_count
                  FROM vacancies v
                  LEFT JOIN users u ON v.recruiter_id = u.id
                  WHERE 1=1";
        $params = [];

        if (!empty($_GET['faculty'])) {
            $query .= " AND v.faculty = ?";
            $params[] = $_GET['faculty'];
        }
        if (!empty($_GET['campus'])) {
            $query .= " AND v.campus = ?";
            $params[] = $_GET['campus'];
        }
        if (!empty($_GET['academic_period'])) {
            $query .= " AND v.academic_period = ?";
            $params[] = $_GET['academic_period'];
        }
        if (!empty($_GET['status'])) {
            $query .= " AND v.status = ?";
            $params[] = $_GET['status'];
        }

        $query .= " ORDER BY v.created_at DESC";
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $items = $stmt->fetchAll();

        $formatted = array_map(function($v) {
            return $this->formatVacancy($v);
        }, $items);

        Response::json(['items' => $formatted, 'total' => count($formatted)]);
    }

    public function show(array $input, array $params): void {
        $id = $params['vacancy_id'] ?? '';
        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT v.*, u.name as recruiter_name, u.email as recruiter_email FROM vacancies v LEFT JOIN users u ON v.recruiter_id = u.id WHERE v.id = ?");
        $stmt->execute([$id]);
        $vac = $stmt->fetch();

        if (!$vac) {
            Response::error("Convocatoria no encontrada.", 404);
        }

        Response::json($this->formatVacancy($vac));
    }

    public function create(array $input): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $title = trim($input['title'] ?? '');
        $description = trim($input['description'] ?? '');

        if (empty($title) || empty($description)) {
            Response::error("Título y descripción son requeridos.", 422);
        }

        $id = Auth::uuid();
        $code = trim($input['code'] ?? ('CONV-' . date('Y') . '-' . substr(bin2hex(random_bytes(3)), 0, 4)));
        $type = $input['type'] ?? 'Cátedra Universitaria';
        $location = $input['location'] ?? 'Sincelejo, Sucre';
        $faculty = $input['faculty'] ?? ($user['faculty'] ?? 'Facultad de Educación y Ciencias Sociales');
        $program = $input['program'] ?? 'Licenciatura en Educación Infantil';
        $campus = $input['campus'] ?? ($user['campus'] ?? 'Sede Principal Sincelejo');
        $academicPeriod = $input['academic_period'] ?? '2026-2';
        $vacanciesCount = (int)($input['vacancies_count'] ?? 1);
        $modality = $input['modality'] ?? 'Presencial';
        $recruiterId = !empty($input['recruiter_id']) ? $input['recruiter_id'] : $user['id'];

        $db = Database::getConnection();
        $ins = $db->prepare("INSERT INTO vacancies (id, code, title, type, location, faculty, program, campus, academic_period, vacancies_count, modality, description, status, opening_date, closing_date, recruiter_id, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)");
        $ins->execute([
            $id, $code, $title, $type, $location, $faculty, $program, $campus, $academicPeriod, $vacanciesCount, $modality, $description, $recruiterId
        ]);

        $st = $db->prepare("SELECT * FROM vacancies WHERE id = ?");
        $st->execute([$id]);
        Response::json($this->formatVacancy($st->fetch()), 201);
    }

    public function delete(array $input, array $params): void {
        Auth::requireRole(['administrador']);
        $id = $params['vacancy_id'] ?? '';
        $db = Database::getConnection();
        $del = $db->prepare("DELETE FROM vacancies WHERE id = ?");
        $del->execute([$id]);
        Response::json(['message' => 'Convocatoria eliminada correctamente.']);
    }

    public function publicList(): void {
        $db = Database::getConnection();
        $stmt = $db->query("SELECT v.*, u.name as recruiter_name FROM vacancies v LEFT JOIN users u ON v.recruiter_id = u.id WHERE v.status = 'active' ORDER BY v.created_at DESC");
        $items = $stmt->fetchAll();

        $formatted = array_map(function($v) {
            return $this->formatVacancy($v);
        }, $items);

        Response::json(['items' => $formatted, 'total' => count($formatted)]);
    }

    private function formatVacancy(array $v): array {
        return [
            'id' => $v['id'],
            'code' => $v['code'] ?? '',
            'title' => $v['title'],
            'type' => $v['type'],
            'location' => $v['location'],
            'faculty' => $v['faculty'] ?? 'Facultad de Educación y Ciencias Sociales',
            'program' => $v['program'] ?? 'Licenciatura en Educación Infantil',
            'campus' => $v['campus'] ?? 'Sede Principal Sincelejo',
            'academicPeriod' => $v['academic_period'] ?? '2026-2',
            'vacanciesCount' => (int)($v['vacancies_count'] ?? 1),
            'modality' => $v['modality'] ?? 'Presencial',
            'description' => $v['description'],
            'status' => $v['status'],
            'openingDate' => $v['opening_date'] ?? null,
            'closingDate' => $v['closing_date'] ?? null,
            'recruiter' => !empty($v['recruiter_id']) ? [
                'id' => $v['recruiter_id'],
                'name' => $v['recruiter_name'] ?? 'Equipo CECAR',
                'email' => $v['recruiter_email'] ?? ''
            ] : null,
            'applicationsCount' => (int)($v['applications_count'] ?? 0),
            'createdAt' => $v['created_at']
        ];
    }

    public function update(array $input, array $params): void {
        Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $id = $params['vacancy_id'] ?? '';
        $db = Database::getConnection();

        $stmt = $db->prepare("SELECT * FROM vacancies WHERE id = ?");
        $stmt->execute([$id]);
        $vac = $stmt->fetch();
        if (!$vac) Response::error("Convocatoria no encontrada.", 404);

        $fields = [];
        $sqlParams = [];

        foreach (['title', 'type', 'location', 'description', 'status', 'recruiter_id', 'faculty', 'campus', 'program', 'modality'] as $k) {
            if (array_key_exists($k, $input)) {
                $fields[] = "{$k} = ?";
                $sqlParams[] = $input[$k];
            }
        }

        if (!empty($fields)) {
            $sqlParams[] = $id;
            $sql = "UPDATE vacancies SET " . implode(', ', $fields) . " WHERE id = ?";
            $upd = $db->prepare($sql);
            $upd->execute($sqlParams);
        }

        $st = $db->prepare("SELECT v.*, u.name as recruiter_name, u.email as recruiter_email FROM vacancies v LEFT JOIN users u ON v.recruiter_id = u.id WHERE v.id = ?");
        $st->execute([$id]);
        Response::json($this->formatVacancy($st->fetch()));
    }

}
