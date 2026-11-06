<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class UserController {
    public function index(): void {
        Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $db = Database::getConnection();

        $query = "SELECT * FROM users WHERE 1=1";
        $params = [];
        if (!empty($_GET['role'])) {
            $query .= " AND role = ?";
            $params[] = $_GET['role'];
        }
        $query .= " ORDER BY created_at DESC";

        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $users = $stmt->fetchAll();

        $formatted = array_map(function($u) {
            return Auth::userData($u);
        }, $users);

        Response::json(['items' => $formatted, 'total' => count($formatted)]);
    }

    public function promote(array $input, array $params): void {
        Auth::requireRole(['administrador']);
        $userId = $params['user_id'] ?? '';
        $role = $input['role'] ?? 'reclutador';

        $db = Database::getConnection();
        $upd = $db->prepare("UPDATE users SET role = ? WHERE id = ?");
        $upd->execute([$role, $userId]);

        Response::json(['message' => "Rol de usuario actualizado a {$role} exitosamente."]);
    }

    public function delete(array $input, array $params): void {
        Auth::requireRole(['administrador']);
        $userId = $params['user_id'] ?? '';
        $db = Database::getConnection();
        $del = $db->prepare("DELETE FROM users WHERE id = ?");
        $del->execute([$userId]);

        Response::json(['message' => 'Usuario eliminado correctamente.']);
    }

    public function update(array $input, array $params): void {
        Auth::requireRole(['administrador']);
        $userId = $params['user_id'] ?? '';
        $name = trim($input['name'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));

        $db = Database::getConnection();
        $fields = [];
        $sqlParams = [];
        if (!empty($name)) {
            $fields[] = "name = ?";
            $sqlParams[] = $name;
        }
        if (!empty($email)) {
            $fields[] = "email = ?";
            $sqlParams[] = $email;
        }
        if (isset($input['role'])) {
            $fields[] = "role = ?";
            $sqlParams[] = $input['role'];
        }

        if (!empty($fields)) {
            $sqlParams[] = $userId;
            $upd = $db->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?");
            $upd->execute($sqlParams);
        }

        $st = $db->prepare("SELECT * FROM users WHERE id = ?");
        $st->execute([$userId]);
        $row = $st->fetch();
        if (!$row) Response::error("Usuario no encontrado.", 404);
        Response::json(Auth::userData($row));
    }

}
