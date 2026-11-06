<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class TestController {
    public function recordTest(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'desarrollo_profesoral']);
        $appId = $params['application_id'] ?? '';
        $testType = $input['test_type'] ?? 'psicotecnica';
        $name = trim($input['name'] ?? 'Prueba Psicotécnica');
        $score = (int)($input['score'] ?? 0);
        $passed = !empty($input['passed']);
        $notes = $input['notes'] ?? '';

        $db = Database::getConnection();
        $id = Auth::uuid();
        $ins = $db->prepare("INSERT INTO test_results (id, application_id, test_type, name, score, max_score, passed, notes, evaluated_by_id, evaluated_at) VALUES (?, ?, ?, ?, ?, 100, ?, ?, ?, CURRENT_TIMESTAMP)");
        $ins->execute([$id, $appId, $testType, $name, $score, $passed ? 1 : 0, $notes, $user['id']]);

        Response::json(['id' => $id, 'message' => 'Resultado de prueba registrado exitosamente.'], 201);
    }

    public function recordClassroomTest(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'desarrollo_profesoral']);
        $appId = $params['application_id'] ?? '';
        $topic = trim($input['topic'] ?? 'Micro-clase pedagógica');
        $score = (int)($input['score'] ?? 0);
        $passed = !empty($input['passed']);
        $notes = $input['notes'] ?? '';
        $rubric = $input['rubric'] ?? [];

        $db = Database::getConnection();
        $id = Auth::uuid();

        // Check existing
        $st = $db->prepare("SELECT id FROM classroom_tests WHERE application_id = ?");
        $st->execute([$appId]);
        if ($row = $st->fetch()) {
            $upd = $db->prepare("UPDATE classroom_tests SET topic = ?, rubric_json = ?, score = ?, passed = ?, notes = ?, evaluator_id = ?, evaluated_at = CURRENT_TIMESTAMP WHERE application_id = ?");
            $upd->execute([$topic, json_encode($rubric, JSON_UNESCAPED_UNICODE), $score, $passed ? 1 : 0, $notes, $user['id'], $appId]);
            Response::json(['id' => $row['id'], 'message' => 'Prueba de aula actualizada exitosamente.']);
            return;
        }

        $ins = $db->prepare("INSERT INTO classroom_tests (id, application_id, topic, rubric_json, score, passed, notes, evaluator_id, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
        $ins->execute([$id, $appId, $topic, json_encode($rubric, JSON_UNESCAPED_UNICODE), $score, $passed ? 1 : 0, $notes, $user['id']]);

        Response::json(['id' => $id, 'message' => 'Dictamen de prueba de aula registrado exitosamente.'], 201);
    }
}
