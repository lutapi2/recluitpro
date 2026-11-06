<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class AuthController {
    public function register(array $input): void {
        $name = trim($input['name'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        $privacyConsent = !empty($input['privacy_consent']);

        if (empty($name) || strlen($name) < 2) {
            Response::error("El nombre debe tener al menos 2 caracteres.", 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error("Correo electrónico no válido.", 422);
        }
        if (strlen($password) < 6) {
            Response::error("La contraseña debe tener al menos 6 caracteres.", 422);
        }
        if (!$privacyConsent) {
            Response::error("Debes aceptar el consentimiento de privacidad.", 422);
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            Response::error("Ya existe una cuenta registrada con este correo electrónico.", 409);
        }

        $userId = Auth::uuid();
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $now = date('Y-m-d H:i:s');

        $ins = $db->prepare("INSERT INTO users (id, name, email, password_hash, role, privacy_consent_at, privacy_consent_version, email_verified_at, created_at, last_activity_at) VALUES (?, ?, ?, ?, 'candidato', ?, '3.0', ?, ?, ?)");
        $ins->execute([$userId, $name, $email, $hash, $now, $now, $now, $now]);

        $st = $db->prepare("SELECT * FROM users WHERE id = ?");
        $st->execute([$userId]);
        $user = $st->fetch();

        $token = Auth::createSession($userId);
        Response::json(['token' => $token, 'user' => Auth::userData($user)], 201);
    }

    public function login(array $input): void {
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';

        if (empty($email) || empty($password)) {
            Response::error("Correo y contraseña requeridos.", 422);
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error("Credenciales incorrectas. Verifica tu correo y contraseña.", 401);
        }

        if (empty($user['is_active'])) {
            Response::error("Esta cuenta se encuentra desactivada.", 403);
        }

        $token = Auth::createSession($user['id']);
        Response::json(['token' => $token, 'user' => Auth::userData($user)]);
    }

    public function me(): void {
        $user = Auth::requireUser();
        Response::json(Auth::userData($user));
    }

    public function logout(): void {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            $tokenHash = hash('sha256', $matches[1]);
            $db = Database::getConnection();
            $del = $db->prepare("DELETE FROM auth_sessions WHERE token_hash = ?");
            $del->execute([$tokenHash]);
        }
        Response::json(['message' => 'Sesión cerrada correctamente.']);
    }

    public function csrf(): void {
        Response::json(['csrf_token' => bin2hex(random_bytes(16))]);
    }

    public function changePassword(array $input): void {
        $user = Auth::requireUser();
        $currentPass = $input['current_password'] ?? '';
        $newPass = $input['new_password'] ?? '';

        if (strlen($newPass) < 8) {
            Response::error("La nueva contraseña debe tener al menos 8 caracteres.", 422);
        }

        if (!password_verify($currentPass, $user['password_hash'])) {
            Response::error("La contraseña actual no es correcta.", 400);
        }

        $db = Database::getConnection();
        $newHash = password_hash($newPass, PASSWORD_DEFAULT);
        $upd = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
        $upd->execute([$newHash, $user['id']]);

        Response::json(['message' => 'Contraseña actualizada exitosamente.']);
    }

    public function updateProfile(array $input): void {
        $user = Auth::requireUser();
        $name = trim($input['name'] ?? $user['name']);
        $phone = trim($input['phone'] ?? ($user['phone'] ?? ''));
        $location = trim($input['location'] ?? ($user['location'] ?? ''));

        $db = Database::getConnection();
        $upd = $db->prepare("UPDATE users SET name = ?, phone = ?, location = ? WHERE id = ?");
        $upd->execute([$name, $phone, $location, $user['id']]);

        $st = $db->prepare("SELECT * FROM users WHERE id = ?");
        $st->execute([$user['id']]);
        $updated = $st->fetch();

        Response::json(Auth::userData($updated));
    }

    public function deleteAccount(array $input): void {
        $user = Auth::requireUser();
        $currentPass = $input['current_password'] ?? '';

        if (!password_verify($currentPass, $user['password_hash'])) {
            Response::error("Contraseña incorrecta.", 400);
        }

        $db = Database::getConnection();
        $del = $db->prepare("DELETE FROM users WHERE id = ?");
        $del->execute([$user['id']]);

        Response::json(['message' => 'Cuenta eliminada correctamente.']);
    }
}
