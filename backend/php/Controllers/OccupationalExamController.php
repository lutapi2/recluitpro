<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class OccupationalExamController {
    public function recordExam(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'salud_ocupacional']);
        $appId = $params['application_id'] ?? '';
        $provider = trim($input['provider'] ?? 'IPS Salud Ocupacional CECAR');
        $fitnessConcept = $input['fitness_concept'] ?? 'apto';
        $restrictions = $input['restrictions'] ?? null;

        if (!in_array($fitnessConcept, ['apto', 'apto_con_restricciones', 'no_apto', 'pendiente'])) {
            Response::error("Concepto de aptitud no válido.", 422);
        }

        $db = Database::getConnection();
        $id = Auth::uuid();

        $st = $db->prepare("SELECT id FROM occupational_exams WHERE application_id = ?");
        $st->execute([$appId]);
        if ($row = $st->fetch()) {
            $upd = $db->prepare("UPDATE occupational_exams SET provider = ?, fitness_concept = ?, restrictions = ?, evaluated_at = CURRENT_TIMESTAMP WHERE application_id = ?");
            $upd->execute([$provider, $fitnessConcept, $restrictions, $appId]);
        } else {
            $ins = $db->prepare("INSERT INTO occupational_exams (id, application_id, provider, fitness_concept, restrictions, evaluated_at, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            $ins->execute([$id, $appId, $provider, $fitnessConcept, $restrictions]);
        }

        $updApp = $db->prepare("UPDATE applications SET status = 'examen_ocupacional' WHERE id = ?");
        $updApp->execute([$appId]);

        Response::json([
            'message' => 'Concepto médico de salud ocupacional guardado conforme a la regla RN-027.',
            'concept' => $fitnessConcept
        ]);
    }
}
