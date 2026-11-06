<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class HelpTicketController {
    public function index(): void {
        $user = Auth::requireUser();
        $db = Database::getConnection();

        if ($user['role'] === 'candidato') {
            $stmt = $db->prepare("SELECT t.*, u.name as user_name, u.email as user_email, r.name as responder_name FROM help_tickets t JOIN users u ON t.user_id = u.id LEFT JOIN users r ON t.responded_by_id = r.id WHERE t.user_id = ? ORDER BY t.created_at DESC");
            $stmt->execute([$user['id']]);
        } else {
            $stmt = $db->query("SELECT t.*, u.name as user_name, u.email as user_email, r.name as responder_name FROM help_tickets t JOIN users u ON t.user_id = u.id LEFT JOIN users r ON t.responded_by_id = r.id ORDER BY t.created_at DESC");
        }

        Response::json(['items' => $stmt->fetchAll()]);
    }

    public function create(array $input): void {
        $user = Auth::requireUser();
        $category = $input['category'] ?? 'plataforma';
        $subject = trim($input['subject'] ?? '');
        $message = trim($input['message'] ?? '');

        if (empty($subject) || empty($message)) {
            Response::error("Asunto y mensaje son requeridos.", 422);
        }

        $id = Auth::uuid();
        $db = Database::getConnection();
        $ins = $db->prepare("INSERT INTO help_tickets (id, user_id, category, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'abierto', CURRENT_TIMESTAMP)");
        $ins->execute([$id, $user['id'], $category, $subject, $message]);

        Response::json(['id' => $id, 'message' => 'Ticket de soporte creado exitosamente.'], 201);
    }

    public function reply(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $ticketId = $params['ticket_id'] ?? '';
        $response = trim($input['response'] ?? '');

        if (empty($response)) Response::error("La respuesta no puede estar vacía.", 422);

        $db = Database::getConnection();
        $upd = $db->prepare("UPDATE help_tickets SET response = ?, responded_by_id = ?, status = 'resuelto', resolved_at = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$response, $user['id'], $ticketId]);

        Response::json(['message' => 'Respuesta enviada y ticket resuelto exitosamente.']);
    }
}
