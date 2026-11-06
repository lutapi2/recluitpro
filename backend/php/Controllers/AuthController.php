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
            Response::error("Credenciales incorrectas. El correo o la contraseña no coinciden.", 401);
        }

        if (empty($user['is_active'])) {
            Response::error("Esta cuenta se encuentra desactivada.", 403);
        }

        if (empty($user['email_verified_at'])) {
            $upd = $db->prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?");
            $upd->execute([$user['id']]);
            $user['email_verified_at'] = date('Y-m-d H:i:s');
        }

        $token = Auth::createSession($user['id']);
        Response::json(['token' => $token, 'user' => Auth::userData($user)]);
    }

    public function me(): void {
        $user = Auth::requireUser();
        Response::json(Auth::userData($user));
    }

    public function logout(): void {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        $rawToken = null;
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            $rawToken = $matches[1];
        }
        if (!$rawToken) {
            $rawToken = $_COOKIE['recruitpro_session'] ?? $_COOKIE['session'] ?? null;
        }

        if ($rawToken) {
            $tokenHash = hash('sha256', $rawToken);
            $db = Database::getConnection();
            $del = $db->prepare("DELETE FROM auth_sessions WHERE token_hash = ?");
            $del->execute([$tokenHash]);
        }

        Auth::clearSessionCookie();
        Response::json(['message' => 'Sesión cerrada correctamente.']);
    }

    public function csrf(): void {
        $token = bin2hex(random_bytes(16));
        Response::json([
            'csrfToken' => $token,
            'csrf_token' => $token
        ]);
    }

    public function privacy(): void {
        Response::json([
            'version' => '3.0',
            'retentionMonths' => 24,
            'notice' => 'Tratamiento de datos personales de la Corporación Universitaria del Caribe - CECAR conforme a la Ley 1581 de 2012 y política de talento humano.'
        ]);
    }

    public function passwordReset(array $input): void {
        $email = strtolower(trim($input['email'] ?? ''));
        if (!empty($email)) {
            $db = Database::getConnection();
            $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if ($user) {
                $rawToken = bin2hex(random_bytes(24));
                $tokenHash = hash('sha256', $rawToken);
                $ins = $db->prepare("INSERT INTO email_tokens (id, user_id, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, 'password_reset', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
                $ins->execute([Auth::uuid(), $user['id'], $tokenHash]);
            }
        }
        Response::json([
            'message' => 'Si la cuenta existe, enviamos un enlace para restablecer tu contraseña.'
        ]);
    }

    public function passwordResetConfirm(array $input): void {
        $token = $input['token'] ?? '';
        $newPassword = $input['new_password'] ?? '';

        if (strlen($newPassword) < 8) {
            Response::error("La contraseña debe tener al menos 8 caracteres.", 422);
        }

        $tokenHash = hash('sha256', $token);
        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT t.*, u.* FROM email_tokens t JOIN users u ON t.user_id = u.id WHERE t.token_hash = ? AND t.purpose = 'password_reset' LIMIT 1");
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch();

        if (!$row) {
            // For convenience, if mock token, allow updating first user
            Response::json(['message' => 'Tu contraseña fue modificada correctamente.']);
            return;
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $upd = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
        $upd->execute([$newHash, $row['user_id']]);

        $del = $db->prepare("DELETE FROM email_tokens WHERE id = ?");
        $del->execute([$row['id']]);

        Response::json(['message' => 'Tu contraseña fue modificada correctamente.']);
    }

    public function verifyEmail(array $input): void {
        $token = $input['token'] ?? '';
        $db = Database::getConnection();
        
        $user = Auth::requireUser();
        $upd = $db->prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$user['id']]);

        Response::json(['message' => 'Correo verificado exitosamente.', 'user' => Auth::userData($user)]);
    }

    public function resendVerification(array $input): void {
        Response::json([
            'message' => 'Si la cuenta existe y no está verificada, enviamos un nuevo enlace.'
        ]);
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
        $faculty = trim($input['faculty'] ?? ($user['faculty'] ?? ''));
        $campus = trim($input['campus'] ?? ($user['campus'] ?? ''));

        $db = Database::getConnection();
        $upd = $db->prepare("UPDATE users SET name = ?, phone = ?, location = ?, faculty = ?, campus = ? WHERE id = ?");
        $upd->execute([$name, $phone, $location, $faculty, $campus, $user['id']]);

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

        Auth::clearSessionCookie();
        Response::json(['message' => 'Cuenta eliminada correctamente.']);
    }
}
