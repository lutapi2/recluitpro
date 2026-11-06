<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class ReportController {
    public function specialized(): void {
        Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'auditor']);
        $reportType = $_GET['report_type'] ?? 'no_aprobados';
        $records = $this->fetchRecords($reportType);
        Response::json(['reportType' => $reportType, 'records' => $records, 'total' => count($records)]);
    }

    public function exportCsv(): void {
        Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'auditor']);
        $reportType = $_GET['report_type'] ?? 'no_aprobados';
        $records = $this->fetchRecords($reportType);

        $headers = ['ID', 'Candidato', 'Correo', 'Convocatoria', 'Facultad', 'Sede', 'Etapa', 'Responsable', 'Fecha Postulacion'];
        if ($reportType === 'no_aprobados') {
            $headers[] = 'Causal de Descarte';
        } elseif ($reportType === 'seleccionados') {
            $headers[] = 'Estado Formalizacion';
            $headers[] = 'Codigo Empleado';
        }

        $lines = [];
        $lines[] = implode(';', array_map(fn($h) => '"' . str_replace('"', '""', $h) . '"', $headers));

        foreach ($records as $r) {
            $row = [
                substr($r['id'], 0, 8),
                $r['candidateName'],
                $r['candidateEmail'],
                $r['vacancyCode'] . ' - ' . $r['vacancyTitle'],
                $r['faculty'],
                $r['campus'],
                $r['stage'],
                $r['assignedResponsible'],
                $r['appliedAt']
            ];
            if ($reportType === 'no_aprobados') {
                $row[] = $r['discardReason'] ?? '';
            } elseif ($reportType === 'seleccionados') {
                $row[] = $r['formalizationStatus'] ?? '';
                $row[] = $r['employeeCode'] ?? '';
            }
            $lines[] = implode(';', array_map(fn($v) => '"' . str_replace('"', '""', (string)$v) . '"', $row));
        }

        // Prepend UTF-8 BOM so Excel opens with proper accents and ñ without corruption
        $csvContent = "\xEF\xBB\xBF" . implode("\r\n", $lines);
        $filename = "reporte_cecar_{$reportType}_" . date('Ymd_His') . ".csv";

        Response::download($filename, $csvContent, "text/csv; charset=utf-8");
    }

    public function summary(): void {
        $user = Auth::requireUser();
        $db = Database::getConnection();

        $vacanciesCount = (int)$db->query("SELECT COUNT(*) FROM vacancies")->fetchColumn();
        $activeVacanciesCount = (int)$db->query("SELECT COUNT(*) FROM vacancies WHERE status = 'active'")->fetchColumn();
        $applicationsCount = (int)$db->query("SELECT COUNT(*) FROM applications")->fetchColumn();
        $pendingReviewsCount = (int)$db->query("SELECT COUNT(*) FROM applications WHERE status IN ('recibida', 'enviada', 'en_revision')")->fetchColumn();
        $selectedCount = (int)$db->query("SELECT COUNT(*) FROM applications WHERE status IN ('seleccionada', 'vinculada')")->fetchColumn();

        Response::json([
            'vacancies' => $vacanciesCount,
            'activeVacancies' => $activeVacanciesCount,
            'applications' => $applicationsCount,
            'pendingReviews' => $pendingReviewsCount,
            'selected' => $selectedCount
        ]);
    }

    private function fetchRecords(string $reportType): array {
        $db = Database::getConnection();
        $query = "SELECT a.*, v.title as vacancy_title, v.code as vacancy_code, v.faculty as vacancy_faculty,
                  v.campus as vacancy_campus, v.academic_period, u.name as candidate_name, u.email as candidate_email,
                  rec.name as recruiter_name, dr.name as reason_name, b.employee_code, d.status as dossier_status
                  FROM applications a
                  JOIN vacancies v ON a.vacancy_id = v.id
                  JOIN users u ON a.candidate_id = u.id
                  LEFT JOIN users rec ON a.assigned_recruiter_id = rec.id
                  LEFT JOIN discard_reasons dr ON a.discard_reason_id = dr.id
                  LEFT JOIN hiring_dossiers d ON a.id = d.application_id
                  LEFT JOIN employment_bindings b ON d.id = b.hiring_id
                  WHERE 1=1";
        $params = [];

        if ($reportType === 'no_aprobados') {
            $query .= " AND a.status IN ('no_seleccionada', 'rechazada', 'retirada', 'no_continua')";
        } elseif ($reportType === 'en_proceso') {
            $query .= " AND a.status IN ('recibida', 'enviada', 'en_revision', 'subsanacion_requerida', 'habilitada', 'preseleccionada', 'entrevista', 'entrevistada', 'oferta', 'examen_ocupacional', 'en_contratacion')";
        } elseif ($reportType === 'seleccionados') {
            $query .= " AND a.status IN ('seleccionada', 'vinculada')";
        }

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
        if (!empty($_GET['vacancy_id'])) {
            $query .= " AND v.id = ?";
            $params[] = $_GET['vacancy_id'];
        }

        $query .= " ORDER BY a.created_at DESC";
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        return array_map(function($r) {
            return [
                'id' => $r['id'],
                'candidateName' => $r['candidate_name'],
                'candidateEmail' => $r['candidate_email'],
                'vacancyCode' => $r['vacancy_code'] ?? 'S/C',
                'vacancyTitle' => $r['vacancy_title'],
                'faculty' => $r['vacancy_faculty'] ?? 'Facultad de Educación y Ciencias Sociales',
                'campus' => $r['vacancy_campus'] ?? 'Sede Principal Sincelejo',
                'stage' => $r['status'],
                'assignedResponsible' => $r['recruiter_name'] ?? 'Talento Humano CECAR',
                'appliedAt' => substr($r['created_at'], 0, 10),
                'discardReason' => $r['reason_name'] ?? $r['discard_note'] ?? 'No especificada',
                'formalizationStatus' => $r['dossier_status'] ?? ($r['status'] === 'vinculada' ? 'Formalizado' : 'En trámite'),
                'employeeCode' => $r['employee_code'] ?? 'En trámite'
            ];
        }, $rows);
    }
}
