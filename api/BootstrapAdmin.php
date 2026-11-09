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
        $check = $pdo->query("SELECT id FROM users WHERE role = 'ADMIN' OR role = 'administrador' LIMIT 1");
        if ($check->fetch()) {
            echo "Aviso: Ya existe un administrador registrado en el sistema.\n";
            return false;
        }

        $now = Config::utcNow();
        $userId = Config::uuid();
        $hash = Security::hashPassword($password);

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
