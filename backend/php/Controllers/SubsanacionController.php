<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class SubsanacionController {
    public function request(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'revisor']);
        $appId = $params['application_id'] ?? '';
        $days = (int)($input['days'] ?? 5);
        $generalNote = $input['general_note'] ?? 'Se requiere subsanar los soportes documentales observados.';

        $db = Database::getConnection();
        $appStmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $appStmt->execute([$appId]);
        $app = $appStmt->fetch();
        if (!$app) Response::error("Postulación no encontrada.", 404);

        // Fetch observed items
        $obsStmt = $db->prepare("SELECT id, item_type, title, reviewer_note FROM application_items WHERE application_id = ? AND status = 'observado'");
        $obsStmt->execute([$appId]);
        $observed = $obsStmt->fetchAll();

        $deadline = date('Y-m-d H:i:s', strtotime("+{$days} weekdays"));

        $upd = $db->prepare("UPDATE applications SET status = 'subsanacion_requerida', document_status = 'observado', subsanacion_deadline = ? WHERE id = ?");
        $upd->execute([$deadline, $appId]);

        $subId = Auth::uuid();
        $ins = $db->prepare("INSERT INTO subsanacion_requests (id, application_id, requested_by_id, status, deadline, items_summary, general_note, requested_at) VALUES (?, ?, ?, 'pendiente', ?, ?, ?, CURRENT_TIMESTAMP)");
        $ins->execute([$subId, $appId, $user['id'], $deadline, json_encode($observed, JSON_UNESCAPED_UNICODE), $generalNote]);

        // Log
        $insAct = $db->prepare("INSERT INTO application_activities (id, application_id, author_id, event_type, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'solicitud_subsanacion', ?, 'subsanacion_requerida', ?, CURRENT_TIMESTAMP)");
        $insAct->execute([Auth::uuid(), $appId, $user['id'], $app['status'], "Plazo legal: {$days} días hábiles (vence {$deadline}). Nota: {$generalNote}"]);

        Response::json([
            'message' => 'Solicitud de subsanación radicada formalmente.',
            'deadline' => $deadline,
            'observedItemsCount' => count($observed)
        ]);
    }

    public function submit(array $input, array $params): void {
        $user = Auth::requireUser();
        $appId = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $appStmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $appStmt->execute([$appId]);
        $app = $appStmt->fetch();
        if (!$app) Response::error("Postulación no encontrada.", 404);
        if ($user['role'] === 'candidato' && $app['candidate_id'] !== $user['id']) Response::error("No autorizado.", 403);

        if (!empty($app['subsanacion_deadline']) && strtotime($app['subsanacion_deadline']) < time()) {
            Response::error("El plazo legal de subsanación ha vencido. Conforme a la regla RN-011 no es posible radicar modificaciones extemporáneas.", 400);
        }

        $upd = $db->prepare("UPDATE applications SET status = 'en_revision', document_status = 'pendiente' WHERE id = ?");
        $upd->execute([$appId]);

        $updSub = $db->prepare("UPDATE subsanacion_requests SET status = 'respondida', responded_at = CURRENT_TIMESTAMP WHERE application_id = ? AND status = 'pendiente'");
        $updSub->execute([$appId]);

        $insAct = $db->prepare("INSERT INTO application_activities (id, application_id, author_id, event_type, from_status, to_status, note, created_at) VALUES (?, ?, ?, 'subsanacion_radicada', 'subsanacion_requerida', 'en_revision', 'El aspirante ha corregido los soportes observados dentro del plazo legal.', CURRENT_TIMESTAMP)");
        $insAct->execute([Auth::uuid(), $appId, $user['id']]);

        Response::json(['message' => 'Subsanación radicada exitosamente para revisión de Talento Humano.']);
    }
}
