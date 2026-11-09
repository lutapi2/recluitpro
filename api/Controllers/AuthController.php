<?php
declare(strict_types=1);

namespace RecruitPro\Controllers;

use PDO;
use Exception;
use RecruitPro\Config;
use RecruitPro\Database;
use RecruitPro\Response;
use RecruitPro\Security;
use RecruitPro\Serialization;
use RecruitPro\EmailService;

require_once __DIR__ . '/../Config.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Security.php';
require_once __DIR__ . '/../Serialization.php';
require_once __DIR__ . '/../EmailService.php';

class AuthController {
    public static function csrf(): void {
        $token = $_COOKIE[Config::CSRF_COOKIE] ?? null;
        if (!$token) {
            $token = bin2hex(random_bytes(24));
        }
        Security::setCsrfCookie($token);
        Response::json(['csrfToken' => $token]);
    }

    public static function register(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();

        $consent = !empty($body['privacy_consent']);
        if (!$consent) {
            Response::error("Debes aceptar el aviso de privacidad para crear una cuenta.", 422);
        }

        $name = trim($body['name'] ?? '');
        if (empty($name)) {
            Response::error("Escribe tu nombre.", 422);
        }

        try {
            $email = Config::normalizeEmail($body['email'] ?? '');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 422);
        }

        $password = (string)($body['password'] ?? '');
        if (strlen($password) < 6) {
            Response::error("La contraseña debe tener al menos 6 caracteres.", 422);
        }

        // Check unique email
        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
        $checkStmt->execute([':email' => $email]);
        if ($checkStmt->fetch()) {
            Response::error("Ya existe una cuenta con este correo.", 409);
        }

        $userId = Config::uuid();
        $now = Config::utcNow();
        $hash = Security::hashPassword($password);

        $stmt = $pdo->prepare("
            INSERT INTO users (id, name, email, password_hash, role, created_at, last_activity_at, email_verified_at, privacy_consent_at, privacy_consent_version)
            VALUES (:id, :name, :email, :password_hash, :role, :created_at, :last_activity_at, :email_verified_at, :privacy_consent_at, :privacy_consent_version)
        ");
        $stmt->execute([
            ':id' => $userId,
            ':name' => $name,
            ':email' => $email,
            ':password_hash' => $hash,
            ':role' => 'CANDIDATE',
            ':created_at' => $now,
            ':last_activity_at' => $now,
            ':email_verified_at' => $now,
            ':privacy_consent_at' => $now,
            ':privacy_consent_version' => Config::PRIVACY_CONSENT_VERSION,
        ]);

        $userStmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
        $userStmt->execute([':id' => $userId]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);

        Security::createSession($pdo, $user);

        Response::json([
            'message' => '¡Cuenta creada exitosamente! Redirigiendo...',
            'authenticated' => true,
            'redirect' => 'dashboard.html',
        ], 201);
    }

    public static function login(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();

        try {
            $email = Config::normalizeEmail($body['email'] ?? '');
        } catch (Exception $e) {
            Response::error("Correo o contraseña incorrectos.", 401);
        }

        $password = (string)($body['password'] ?? '');
        if (empty($password)) {
            Response::error("Correo o contraseña incorrectos.", 401);
        }

        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !Security::verifyPassword($password, $user['password_hash'])) {
            Response::error("Correo o contraseña incorrectos.", 401);
        }

        $now = Config::utcNow();
        $touch = $pdo->prepare("UPDATE users SET last_activity_at = :now WHERE id = :id");
        $touch->execute([':now' => $now, ':id' => $user['id']]);
        $user['last_activity_at'] = $now;

        Security::createSession($pdo, $user);
        Response::json(Serialization::userData($user, $pdo, $user));
    }

    public static function me(): void {
        $pdo = Database::getConnection();
        $user = Security::currentUser($pdo);
        Response::json(Serialization::userData($user, $pdo, $user));
    }

    public static function verifyEmail(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();

        $token = trim($body['token'] ?? '');
        if (empty($token)) {
            Response::error("El enlace no es válido o ya expiró.", 400);
        }

        $tokenHash = Security::hashToken($token);
        $now = Config::utcNow();

        $stmt = $pdo->prepare("
            SELECT t.*, u.id as user_id, u.email as user_email
            FROM email_tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token_hash = :hash AND t.purpose = 'verify_email' AND t.expires_at > :now
            LIMIT 1
        ");
        $stmt->execute([':hash' => $tokenHash, ':now' => $now]);
        $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tokenRow) {
            Response::error("El enlace no es válido o ya expiró.", 400);
        }

        // Update user email_verified_at
        $upd = $pdo->prepare("UPDATE users SET email_verified_at = :now, last_activity_at = :now WHERE id = :id");
        $upd->execute([':now' => $now, ':id' => $tokenRow['user_id']]);

        // Delete used token
        $del = $pdo->prepare("DELETE FROM email_tokens WHERE id = :id");
        $del->execute([':id' => $tokenRow['id']]);

        // Fetch refreshed user and create session
        $userStmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
        $userStmt->execute([':id' => $tokenRow['user_id']]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);

        Security::createSession($pdo, $user);
        Response::json(Serialization::userData($user, $pdo, $user));
    }

    public static function resendVerification(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();

        try {
            $email = Config::normalizeEmail($body['email'] ?? '');
            $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
            $stmt->execute([':email' => $email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user && empty($user['email_verified_at'])) {
                // Remove previous tokens
                $pdo->prepare("DELETE FROM email_tokens WHERE user_id = :uid AND purpose = 'verify_email'")
                    ->execute([':uid' => $user['id']]);

                $token = bin2hex(random_bytes(24));
                $expires = date('Y-m-d H:i:s', time() + 86400);
                $ins = $pdo->prepare("
                    INSERT INTO email_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
                    VALUES (:id, :uid, :thash, 'verify_email', :exp, :now)
                ");
                $ins->execute([
                    ':id' => Config::uuid(),
                    ':uid' => $user['id'],
                    ':thash' => Security::hashToken($token),
                    ':exp' => $expires,
                    ':now' => Config::utcNow(),
                ]);

                $baseUrl = (isset($_SERVER['HTTPS']) ? "https://" : "http://") . ($_SERVER['HTTP_HOST'] ?? '127.0.0.1:8000');
                EmailService::sendAccountEmail(
                    $user['email'],
                    "Verifica tu correo de RecruitPro",
                    "Confirma tu dirección de correo",
                    "Usa el enlace para verificar tu correo y activar tu cuenta.",
                    "$baseUrl/verificar.html?token=" . rawurlencode($token)
                );
            }
        } catch (Exception $e) {
            // Silence enumeration
        }

        Response::json([
            'message' => 'Si existe una cuenta pendiente para ese correo, recibirás un enlace de verificación.'
        ], 202);
    }

    public static function passwordReset(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();

        try {
            $email = Config::normalizeEmail($body['email'] ?? '');
            $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email AND email_verified_at IS NOT NULL LIMIT 1");
            $stmt->execute([':email' => $email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user) {
                $pdo->prepare("DELETE FROM email_tokens WHERE user_id = :uid AND purpose = 'password_reset'")
                    ->execute([':uid' => $user['id']]);

                $token = bin2hex(random_bytes(24));
                $expires = date('Y-m-d H:i:s', time() + 3600);
                $ins = $pdo->prepare("
                    INSERT INTO email_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
                    VALUES (:id, :uid, :thash, 'password_reset', :exp, :now)
                ");
                $ins->execute([
                    ':id' => Config::uuid(),
                    ':uid' => $user['id'],
                    ':thash' => Security::hashToken($token),
                    ':exp' => $expires,
                    ':now' => Config::utcNow(),
                ]);

                $baseUrl = (isset($_SERVER['HTTPS']) ? "https://" : "http://") . ($_SERVER['HTTP_HOST'] ?? '127.0.0.1:8000');
                EmailService::sendAccountEmail(
                    $user['email'],
                    "Restablece tu contraseña de RecruitPro",
                    "Solicitud para restablecer la contraseña",
                    "El enlace para crear una nueva contraseña vence en una hora.",
                    "$baseUrl/restablecer.html?token=" . rawurlencode($token)
                );
            }
        } catch (Exception $e) {
            // Silence enumeration
        }

        Response::json([
            'message' => 'Si la cuenta existe y está verificada, recibirás instrucciones por correo.'
        ], 202);
    }

    public static function passwordResetConfirm(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();

        $token = trim($body['token'] ?? '');
        $newPassword = (string)($body['new_password'] ?? '');

        if (strlen($newPassword) < 12) {
            Response::error("La contraseña debe tener al menos 12 caracteres.", 422);
        }

        $tokenHash = Security::hashToken($token);
        $now = Config::utcNow();

        $stmt = $pdo->prepare("
            SELECT * FROM email_tokens 
            WHERE token_hash = :hash AND purpose = 'password_reset' AND expires_at > :now
            LIMIT 1
        ");
        $stmt->execute([':hash' => $tokenHash, ':now' => $now]);
        $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tokenRow) {
            Response::error("El enlace no es válido o ya expiró.", 400);
        }

        $hash = Security::hashPassword($newPassword);
        $upd = $pdo->prepare("UPDATE users SET password_hash = :hash, last_activity_at = :now WHERE id = :id");
        $upd->execute([':hash' => $hash, ':now' => $now, ':id' => $tokenRow['user_id']]);

        // Revoke all existing sessions
        $pdo->prepare("DELETE FROM auth_sessions WHERE user_id = :uid")->execute([':uid' => $tokenRow['user_id']]);
        $pdo->prepare("DELETE FROM email_tokens WHERE id = :id")->execute([':id' => $tokenRow['id']]);

        Response::json(['message' => 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.']);
    }

    public static function profile(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $user = Security::currentUser($pdo);

        $name = trim($body['name'] ?? '');
        if (empty($name)) {
            Response::error("Escribe tu nombre.", 422);
        }

        $phone = trim($body['phone'] ?? '');
        $location = trim($body['location'] ?? '');
        $now = Config::utcNow();

        $stmt = $pdo->prepare("
            UPDATE users 
            SET name = :name, phone = :phone, location = :location, last_activity_at = :now
            WHERE id = :id
        ");
        $stmt->execute([
            ':name' => $name,
            ':phone' => $phone ?: null,
            ':location' => $location ?: null,
            ':now' => $now,
            ':id' => $user['id'],
        ]);

        $user['name'] = $name;
        $user['phone'] = $phone ?: null;
        $user['location'] = $location ?: null;
        $user['last_activity_at'] = $now;

        Response::json(Serialization::userData($user, $pdo, $user));
    }

    public static function changePassword(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $user = Security::currentUser($pdo);

        $currentPwd = (string)($body['current_password'] ?? '');
        $newPwd = (string)($body['new_password'] ?? '');

        if (!Security::verifyPassword($currentPwd, $user['password_hash'])) {
            Response::error("La contraseña actual no es correcta.", 400);
        }

        if (strlen($newPwd) < 12) {
            Response::error("La nueva contraseña debe tener al menos 12 caracteres.", 422);
        }

        $now = Config::utcNow();
        $newHash = Security::hashPassword($newPwd);

        $upd = $pdo->prepare("UPDATE users SET password_hash = :hash, last_activity_at = :now WHERE id = :id");
        $upd->execute([':hash' => $newHash, ':now' => $now, ':id' => $user['id']]);

        // Invalidate other sessions
        $currentSessionToken = $_COOKIE[Config::SESSION_COOKIE] ?? '';
        $curHash = Security::hashToken($currentSessionToken);
        $delSessions = $pdo->prepare("DELETE FROM auth_sessions WHERE user_id = :uid AND token_hash != :cur_hash");
        $delSessions->execute([':uid' => $user['id'], ':cur_hash' => $curHash]);

        Response::json(['message' => 'Contraseña actualizada. Las otras sesiones se cerraron.']);
    }

    public static function deleteAccount(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $user = Security::currentUser($pdo);

        if (Config::normalizeRoleForClient($user['role']) !== 'candidato') {
            Response::error("Solicita al administrador la eliminación de una cuenta de equipo.", 403);
        }

        $currentPwd = (string)($body['current_password'] ?? '');
        if (!Security::verifyPassword($currentPwd, $user['password_hash'])) {
            Response::error("La contraseña actual no es correcta.", 400);
        }

        // Gather document paths to delete
        $docStmt = $pdo->prepare("SELECT storage_name FROM documents WHERE owner_id = :uid");
        $docStmt->execute([':uid' => $user['id']]);
        $storageNames = $docStmt->fetchAll(PDO::FETCH_COLUMN);

        $uploadDir = Config::getUploadDir();

        // Foreign keys cascade delete applications, sessions, documents
        $delUser = $pdo->prepare("DELETE FROM users WHERE id = :id");
        $delUser->execute([':id' => $user['id']]);

        Security::clearSession($pdo);

        foreach ($storageNames as $name) {
            $fPath = $uploadDir . DIRECTORY_SEPARATOR . $name;
            if (is_file($fPath)) {
                @unlink($fPath);
            }
        }

        Response::noContent();
    }

    public static function privacy(): void {
        Response::json([
            'version' => Config::PRIVACY_CONSENT_VERSION,
            'retentionMonths' => Config::RETENTION_MONTHS,
            'notice' => "RecruitPro utiliza tus datos de perfil y documentos para gestionar tus postulaciones y procesos de selección. Tus CV solo se comparten con el administrador y los reclutadores responsables de vacantes a las que te postulaste. Las cuentas de candidato, sus postulaciones y documentos se eliminan tras " . Config::RETENTION_MONTHS . " meses de inactividad, sujeto a las obligaciones legales aplicables.",
        ]);
    }

    public static function logout(): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        Security::clearSession($pdo);
        Response::noContent();
    }
}
