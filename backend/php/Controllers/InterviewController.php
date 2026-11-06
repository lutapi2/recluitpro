<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class InterviewController {
    public function listSlots(): void {
        $user = Auth::requireUser();
        $db = Database::getConnection();
        $vacancyId = $_GET['vacancy_id'] ?? '';

        $query = "SELECT * FROM interview_slots WHERE 1=1";
        $params = [];
        if (!empty($vacancyId)) {
            $query .= " AND vacancy_id = ?";
            $params[] = $vacancyId;
        }
        $query .= " ORDER BY start_time ASC";
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        Response::json(['items' => $stmt->fetchAll()]);
    }

    public function createSlot(array $input): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $vacancyId = $input['vacancy_id'] ?? '';
        $startTime = $input['start_time'] ?? '';
        $endTime = $input['end_time'] ?? '';

        if (empty($vacancyId) || empty($startTime) || empty($endTime)) {
            Response::error("vacancy_id, start_time y end_time requeridos.", 422);
        }

        $id = Auth::uuid();
        $modality = $input['modality'] ?? 'virtual';
        $location = $input['location_or_link'] ?? '';
        $maxCapacity = (int)($input['max_capacity'] ?? 1);

        $db = Database::getConnection();
        $ins = $db->prepare("INSERT INTO interview_slots (id, vacancy_id, start_time, end_time, modality, location_or_link, max_capacity, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, 1)");
        $ins->execute([$id, $vacancyId, $startTime, $endTime, $modality, $location, $maxCapacity]);

        Response::json(['id' => $id, 'message' => 'Franja horaria creada exitosamente.'], 201);
    }

    public function schedule(array $input): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $appId = $input['application_id'] ?? '';
        $scheduledAt = $input['scheduled_at'] ?? '';
        $modality = $input['modality'] ?? 'virtual';
        $location = $input['location_or_link'] ?? '';
        $duration = (int)($input['duration_minutes'] ?? 45);

        if (empty($appId) || empty($scheduledAt)) {
            Response::error("application_id y scheduled_at son requeridos.", 422);
        }

        $db = Database::getConnection();
        $id = Auth::uuid();
        $ins = $db->prepare("INSERT INTO interviews (id, application_id, scheduled_at, duration_minutes, modality, location_or_link, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'programada', CURRENT_TIMESTAMP)");
        $ins->execute([$id, $appId, $scheduledAt, $duration, $modality, $location]);

        $upd = $db->prepare("UPDATE applications SET status = 'entrevista' WHERE id = ?");
        $upd->execute([$appId]);

        Response::json(['id' => $id, 'message' => 'Entrevista de comité agendada exitosamente.']);
    }

    public function evaluate(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'entrevistador']);
        $interviewId = $params['interview_id'] ?? '';
        $totalScore = (int)($input['total_score'] ?? 0);
        $concept = $input['concept'] ?? 'favorable';
        $notes = $input['notes'] ?? '';
        $criteria = $input['criteria_scores'] ?? [];

        $db = Database::getConnection();
        $evalId = Auth::uuid();
        $ins = $db->prepare("INSERT INTO interview_evaluations (id, interview_id, evaluator_id, scores_json, total_score, concept, notes, is_consolidated, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)");
        $ins->execute([$evalId, $interviewId, $user['id'], json_encode($criteria, JSON_UNESCAPED_UNICODE), $totalScore, $concept, $notes]);

        $updIntr = $db->prepare("UPDATE interviews SET status = 'realizada' WHERE id = ?");
        $updIntr->execute([$interviewId]);

        // Get application id
        $st = $db->prepare("SELECT application_id FROM interviews WHERE id = ?");
        $st->execute([$interviewId]);
        $intr = $st->fetch();
        if ($intr) {
            $updApp = $db->prepare("UPDATE applications SET status = 'entrevistada', evaluation_score = ? WHERE id = ?");
            $updApp->execute([$totalScore, $intr['application_id']]);
        }

        Response::json(['id' => $evalId, 'message' => 'Evaluación de comité colegiado guardada correctamente.']);
    }

    public function respond(array $input, array $params): void {
        $user = Auth::requireUser();
        $interviewId = $params['interview_id'] ?? '';
        $action = $input['action'] ?? 'confirmar'; // confirmar, reprogramar
        $reason = $input['reason'] ?? '';

        $db = Database::getConnection();
        $newStatus = ($action === 'confirmar') ? 'confirmada' : 'reprogramacion_solicitada';
        $upd = $db->prepare("UPDATE interviews SET status = ?, candidate_notes = ? WHERE id = ?");
        $upd->execute([$newStatus, $reason, $interviewId]);

        Response::json(['message' => "Estado de entrevista actualizado a: {$newStatus}."]);
    }
}
