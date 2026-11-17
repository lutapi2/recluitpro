<?php
declare(strict_types=1);

namespace RecruitPro;

use PDO;
use Exception;

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Security.php';

class BootstrapAdmin {
    public static function createAdmin(string $name, string $email, string $password): bool {
        $name = trim($name);
        $email = strtolower(trim($email));

        if (empty($name) || empty($email) || strlen($password) < 12) {
            echo "Error: Debes proporcionar nombre, correo y contraseña (mínimo 12 caracteres).\n";
            return false;
        }

        $pdo = Database::getConnection();
        $now = Config::utcNow();
        $hash = Security::hashPassword($password);

        // If this user already exists, ensure they are promoted to ADMIN
        $checkUser = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
        $checkUser->execute([':email' => $email]);
        $existing = $checkUser->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $upd = $pdo->prepare("
                UPDATE users 
                SET role = 'ADMIN', password_hash = :hash, name = :name, email_verified_at = COALESCE(email_verified_at, :now)
                WHERE id = :id
            ");
            $upd->execute([':hash' => $hash, ':name' => $name, ':now' => $now, ':id' => $existing['id']]);
            echo "Usuario actualizado a ADMINISTRADOR: $email\n";
            return true;
        }

        $userId = Config::uuid();
        $stmt = $pdo->prepare("
            INSERT INTO users (id, name, email, password_hash, role, created_at, last_activity_at, email_verified_at, privacy_consent_at, privacy_consent_version)
            VALUES (:id, :name, :email, :password_hash, 'ADMIN', :now, :now, :now, :now, :version)
        ");
        $stmt->execute([
            ':id' => $userId,
            ':name' => $name,
            ':email' => $email,
            ':password_hash' => $hash,
            ':now' => $now,
            ':version' => Config::PRIVACY_CONSENT_VERSION,
        ]);

        echo "Administrador creado exitosamente: $email\n";
        return true;
    }
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $name = $argv[1] ?? getenv('BOOTSTRAP_ADMIN_NAME') ?: '';
    $email = $argv[2] ?? getenv('BOOTSTRAP_ADMIN_EMAIL') ?: '';
    $password = $argv[3] ?? getenv('BOOTSTRAP_ADMIN_PASSWORD') ?: '';

    BootstrapAdmin::createAdmin($name, $email, $password);
}
