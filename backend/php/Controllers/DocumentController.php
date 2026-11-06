<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class DocumentController {
    public function upload(): void {
        $user = Auth::requireUser();
        if (empty($_FILES['file'])) {
            Response::error("No se adjuntó ningún archivo.", 400);
        }

        $file = $_FILES['file'];
        $originalName = $file['name'];
        $mediaType = $file['type'] ?: 'application/pdf';
        $size = (int)$file['size'];
        $storageName = Auth::uuid() . '_' . preg_replace('/[^a-zA-Z0-9_\.]/', '', $originalName);
        $fileData = file_get_contents($file['tmp_name']);

        $uploadDir = dirname(__DIR__, 2) . '/uploads';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
        move_uploaded_file($file['tmp_name'], $uploadDir . '/' . $storageName);

        $docId = Auth::uuid();
        $db = Database::getConnection();
        $ins = $db->prepare("INSERT INTO documents (id, owner_id, original_name, storage_name, media_type, size, file_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
        $ins->execute([$docId, $user['id'], $originalName, $storageName, $mediaType, $size, $fileData]);

        Response::json([
            'id' => $docId,
            'name' => $originalName,
            'size' => $size,
            'type' => $mediaType
        ], 201);
    }

    public function show(array $input, array $params): void {
        $docId = $params['document_id'] ?? '';
        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT id, original_name as name, media_type as type, size FROM documents WHERE id = ?");
        $stmt->execute([$docId]);
        $doc = $stmt->fetch();
        if (!$doc) Response::error("Documento no encontrado.", 404);
        Response::json($doc);
    }

    public function view(array $input, array $params): void {
        $docId = $params['document_id'] ?? '';
        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM documents WHERE id = ?");
        $stmt->execute([$docId]);
        $doc = $stmt->fetch();
        if (!$doc) Response::error("Documento no encontrado.", 404);

        $uploadFile = dirname(__DIR__, 2) . '/uploads/' . $doc['storage_name'];
        if (file_exists($uploadFile)) {
            header("Content-Type: " . $doc['media_type']);
            header("Content-Disposition: inline; filename=\"" . $doc['original_name'] . "\"");
            readfile($uploadFile);
            exit;
        } elseif (!empty($doc['file_data'])) {
            header("Content-Type: " . $doc['media_type']);
            header("Content-Disposition: inline; filename=\"" . $doc['original_name'] . "\"");
            echo $doc['file_data'];
            exit;
        }

        Response::error("Archivo no disponible físicamente.", 404);
    }

    public function download(array $input, array $params): void {
        $docId = $params['document_id'] ?? '';
        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM documents WHERE id = ?");
        $stmt->execute([$docId]);
        $doc = $stmt->fetch();
        if (!$doc) Response::error("Documento no encontrado.", 404);

        $uploadFile = dirname(__DIR__, 2) . '/uploads/' . $doc['storage_name'];
        if (file_exists($uploadFile)) {
            header("Content-Type: " . $doc['media_type']);
            header("Content-Disposition: attachment; filename=\"" . $doc['original_name'] . "\"");
            readfile($uploadFile);
            exit;
        } elseif (!empty($doc['file_data'])) {
            header("Content-Type: " . $doc['media_type']);
            header("Content-Disposition: attachment; filename=\"" . $doc['original_name'] . "\"");
            echo $doc['file_data'];
            exit;
        }

        Response::error("Archivo no disponible físicamente.", 404);
    }
}
