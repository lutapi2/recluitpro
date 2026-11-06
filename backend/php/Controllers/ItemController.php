<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class ItemController {
    public function create(array $input, array $params): void {
        $user = Auth::requireUser();
        $appId = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $appStmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $appStmt->execute([$appId]);
        $app = $appStmt->fetch();

        if (!$app) Response::error("Postulación no encontrada.", 404);
        if ($user['role'] === 'candidato' && $app['candidate_id'] !== $user['id']) {
            Response::error("No autorizado.", 403);
        }

        $itemType = $input['item_type'] ?? 'HV-006';
        $section = $input['section'] ?? 'formacion';
        $title = trim($input['title'] ?? '');
        $data = $input['data'] ?? [];

        if (empty($title)) Response::error("El título es obligatorio.", 422);

        $itemId = Auth::uuid();
        $ins = $db->prepare("INSERT INTO application_items (id, application_id, item_type, section, title, data_json, status, is_subsanacion, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pendiente', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        $ins->execute([$itemId, $appId, $itemType, $section, $title, json_encode($data, JSON_UNESCAPED_UNICODE)]);

        $st = $db->prepare("SELECT * FROM application_items WHERE id = ?");
        $st->execute([$itemId]);
        $item = $st->fetch();

        Response::json([
            'id' => $item['id'],
            'item_type' => $item['item_type'],
            'section' => $item['section'],
            'title' => $item['title'],
            'data' => json_decode($item['data_json'], true),
            'status' => $item['status'],
            'supports' => []
        ], 201);
    }

    public function update(array $input, array $params): void {
        $user = Auth::requireUser();
        $appId = $params['application_id'] ?? '';
        $itemId = $params['item_id'] ?? '';
        $db = Database::getConnection();

        $appStmt = $db->prepare("SELECT * FROM applications WHERE id = ?");
        $appStmt->execute([$appId]);
        $app = $appStmt->fetch();
        if (!$app) Response::error("Postulación no encontrada.", 404);

        $itemStmt = $db->prepare("SELECT * FROM application_items WHERE id = ? AND application_id = ?");
        $itemStmt->execute([$itemId, $appId]);
        $item = $itemStmt->fetch();
        if (!$item) Response::error("Ítem no encontrado.", 404);

        // REGLA ESTRICTA RN-011: Bloqueo de ítems aprobados durante subsanación
        if ($user['role'] === 'candidato') {
            if ($app['status'] === 'subsanacion_requerida' && $item['status'] === 'aprobado') {
                Response::error("Regla RN-011 CECAR: Los documentos e ítems ya aprobados no pueden ser modificados durante la subsanación.", 403);
            }
        }

        $title = !empty($input['title']) ? trim($input['title']) : $item['title'];
        $data = !empty($input['data']) ? json_encode($input['data'], JSON_UNESCAPED_UNICODE) : $item['data_json'];
        $newStatus = ($user['role'] === 'candidato' && $item['status'] === 'observado') ? 'pendiente' : $item['status'];

        $upd = $db->prepare("UPDATE application_items SET title = ?, data_json = ?, status = ?, is_subsanacion = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$title, $data, $newStatus, $itemId]);

        Response::json(['message' => 'Ítem actualizado correctamente.']);
    }

    public function delete(array $input, array $params): void {
        $user = Auth::requireUser();
        $appId = $params['application_id'] ?? '';
        $itemId = $params['item_id'] ?? '';
        $db = Database::getConnection();

        $itemStmt = $db->prepare("SELECT * FROM application_items WHERE id = ? AND application_id = ?");
        $itemStmt->execute([$itemId, $appId]);
        $item = $itemStmt->fetch();
        if (!$item) Response::error("Ítem no encontrado.", 404);

        if ($user['role'] === 'candidato' && $item['status'] === 'aprobado') {
            Response::error("Regla RN-011: No puedes eliminar un ítem que ya fue aprobado.", 403);
        }

        $del = $db->prepare("DELETE FROM application_items WHERE id = ?");
        $del->execute([$itemId]);
        Response::json(['message' => 'Ítem eliminado correctamente.']);
    }

    public function review(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano', 'revisor']);
        $appId = $params['application_id'] ?? '';
        $itemId = $params['item_id'] ?? '';
        $result = $input['result'] ?? ''; // aprobado, observado, rechazado
        $reason = $input['reason'] ?? null;
        $observation = $input['observation'] ?? null;

        if (!in_array($result, ['aprobado', 'observado', 'rechazado'])) {
            Response::error("Resultado no válido. Debe ser aprobado, observado o rechazado.", 422);
        }

        $db = Database::getConnection();
        $upd = $db->prepare("UPDATE application_items SET status = ?, reviewer_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$result, $observation ?: $reason, $itemId]);

        $revId = Auth::uuid();
        $ins = $db->prepare("INSERT INTO item_reviews (id, item_id, reviewer_id, result, reason, observation, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
        $ins->execute([$revId, $itemId, $user['id'], $result, $reason, $observation]);

        Response::json(['message' => "Ítem marcado como {$result} exitosamente.", 'result' => $result]);
    }

    public function uploadSupport(array $input, array $params): void {
        $user = Auth::requireUser();
        $appId = $params['application_id'] ?? '';
        $itemId = $params['item_id'] ?? '';
        $db = Database::getConnection();

        $itemStmt = $db->prepare("SELECT * FROM application_items WHERE id = ? AND application_id = ?");
        $itemStmt->execute([$itemId, $appId]);
        $item = $itemStmt->fetch();
        if (!$item) Response::error("Ítem no encontrado.", 404);

        if (empty($_FILES['file'])) {
            Response::error("No se adjuntó ningún archivo.", 400);
        }

        $file = $_FILES['file'];
        $originalName = $file['name'];
        $mediaType = $file['type'] ?: 'application/pdf';
        $size = (int)$file['size'];
        $storageName = Auth::uuid() . '_' . preg_replace('/[^a-zA-Z0-9_\.]/', '', $originalName);
        $fileData = file_get_contents($file['tmp_name']);

        // Save to disk if upload dir exists
        $uploadDir = dirname(__DIR__, 2) . '/uploads';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
        move_uploaded_file($file['tmp_name'], $uploadDir . '/' . $storageName);

        $supportId = Auth::uuid();
        $ins = $db->prepare("INSERT INTO item_supports (id, item_id, original_name, storage_name, media_type, size, file_data, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)");
        $ins->execute([$supportId, $itemId, $originalName, $storageName, $mediaType, $size, $fileData]);

        Response::json([
            'id' => $supportId,
            'name' => $originalName,
            'size' => $size,
            'type' => $mediaType
        ], 201);
    }

    public function viewSupport(array $input, array $params): void {
        $supportId = $params['support_id'] ?? '';
        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM item_supports WHERE id = ?");
        $stmt->execute([$supportId]);
        $sup = $stmt->fetch();

        if (!$sup) Response::error("Soporte no encontrado.", 404);

        $uploadFile = dirname(__DIR__, 2) . '/uploads/' . $sup['storage_name'];
        if (file_exists($uploadFile)) {
            header("Content-Type: " . $sup['media_type']);
            header("Content-Disposition: inline; filename=\"" . $sup['original_name'] . "\"");
            readfile($uploadFile);
            exit;
        } elseif (!empty($sup['file_data'])) {
            header("Content-Type: " . $sup['media_type']);
            header("Content-Disposition: inline; filename=\"" . $sup['original_name'] . "\"");
            echo $sup['file_data'];
            exit;
        }

        Response::error("Archivo no disponible físicamente.", 404);
    }
}
