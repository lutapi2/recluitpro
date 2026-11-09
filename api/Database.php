<?php
declare(strict_types=1);

namespace RecruitPro;

use PDO;
use PDOException;
use Exception;

require_once __DIR__ . '/Config.php';

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $dbPath = Config::getDatabasePath();
            $dbDir = dirname($dbPath);
            if (!is_dir($dbDir)) {
                @mkdir($dbDir, 0777, true);
            }

            try {
                $pdo = new PDO('sqlite:' . $dbPath);
                $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                $pdo->exec('PRAGMA foreign_keys = ON;');
                $pdo->exec('PRAGMA journal_mode = WAL;');

                self::$instance = $pdo;
                self::ensureSchema($pdo);
            } catch (PDOException $e) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['detail' => 'Error de conexión a la base de datos: ' . $e->getMessage()]);
                exit;
            }
        }

        return self::$instance;
    }

    private static function ensureSchema(PDO $pdo): void {
        // Create tables if not existing
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(254) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(13) NOT NULL,
                phone VARCHAR(30),
                location VARCHAR(100),
                created_at DATETIME NOT NULL,
                last_activity_at DATETIME NOT NULL,
                email_verified_at DATETIME,
                privacy_consent_at DATETIME,
                privacy_consent_version VARCHAR(30)
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS email_tokens (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                purpose VARCHAR(20) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS documents (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                owner_id VARCHAR(36) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                media_type VARCHAR(100) NOT NULL,
                storage_name VARCHAR(36) NOT NULL UNIQUE,
                size INTEGER NOT NULL,
                created_at DATETIME NOT NULL,
                file_data BLOB,
                FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS vacancies (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                title VARCHAR(100) NOT NULL,
                type VARCHAR(60) NOT NULL,
                location VARCHAR(100) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(10) NOT NULL,
                recruiter_id VARCHAR(36),
                created_at DATETIME NOT NULL,
                FOREIGN KEY(recruiter_id) REFERENCES users (id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS applications (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                vacancy_id VARCHAR(36) NOT NULL,
                candidate_id VARCHAR(36) NOT NULL,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(30) NOT NULL,
                location VARCHAR(100) NOT NULL,
                resume_id VARCHAR(36) NOT NULL,
                status VARCHAR(20) NOT NULL,
                created_at DATETIME NOT NULL,
                assigned_recruiter_id VARCHAR(36),
                privacy_consent_at DATETIME,
                privacy_consent_version VARCHAR(30),
                ai_score INTEGER,
                ai_verdict VARCHAR(100),
                ai_summary TEXT,
                ai_analyzed_at DATETIME,
                UNIQUE (vacancy_id, candidate_id),
                FOREIGN KEY(vacancy_id) REFERENCES vacancies (id) ON DELETE CASCADE,
                FOREIGN KEY(candidate_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY(resume_id) REFERENCES documents (id) ON DELETE RESTRICT,
                FOREIGN KEY(assigned_recruiter_id) REFERENCES users (id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS application_activities (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                application_id VARCHAR(36) NOT NULL,
                author_id VARCHAR(36),
                event_type VARCHAR(20) NOT NULL,
                from_status VARCHAR(20),
                to_status VARCHAR(20),
                note TEXT,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(application_id) REFERENCES applications (id) ON DELETE CASCADE,
                FOREIGN KEY(author_id) REFERENCES users (id) ON DELETE SET NULL
            );
        ");

        // Verify documents.file_data column
        try {
            $colsStmt = $pdo->query("PRAGMA table_info(documents)");
            $cols = $colsStmt->fetchAll(PDO::FETCH_ASSOC);
            $hasFileData = false;
            foreach ($cols as $col) {
                if (strtolower($col['name']) === 'file_data') {
                    $hasFileData = true;
                    break;
                }
            }
            if (!$hasFileData) {
                $pdo->exec("ALTER TABLE documents ADD COLUMN file_data BLOB");
            }
        } catch (Exception $e) {
            // Ignore if column already exists
        }

        // Seed initial admin user if not present
        $stmt = $pdo->query("SELECT id FROM users WHERE email = 'luctapi89@gmail.com' LIMIT 1");
        if (!$stmt->fetch()) {
            $now = Config::utcNow();
            $adminStmt = $pdo->prepare("
                INSERT INTO users (id, name, email, password_hash, role, created_at, last_activity_at, email_verified_at, privacy_consent_at, privacy_consent_version)
                VALUES (:id, :name, :email, :password_hash, :role, :created_at, :last_activity_at, :email_verified_at, :privacy_consent_at, :privacy_consent_version)
            ");
            $adminStmt->execute([
                ':id' => '7c8ed709-87fc-404d-9dc3-e118d1f62191',
                ':name' => 'Lucas Tapia',
                ':email' => 'luctapi89@gmail.com',
                ':password_hash' => '$argon2id$v=19$m=65536,t=3,p=4$dvtLAEUGZ96eW00Sc5pHMA$XMZ5CBcyF0c0DanwRCg6DConjnhetEAo56HEd9jgv/c',
                ':role' => 'ADMIN',
                ':created_at' => $now,
                ':last_activity_at' => $now,
                ':email_verified_at' => $now,
                ':privacy_consent_at' => $now,
                ':privacy_consent_version' => Config::PRIVACY_CONSENT_VERSION,
            ]);
        }

        // Seed initial vacancies if none exist
        $countVacancies = (int)$pdo->query("SELECT COUNT(*) FROM vacancies")->fetchColumn();
        if ($countVacancies === 0) {
            $now = Config::utcNow();
            $vacStmt = $pdo->prepare("
                INSERT INTO vacancies (id, title, type, location, description, status, recruiter_id, created_at)
                VALUES (:id, :title, :type, :location, :description, :status, :recruiter_id, :created_at)
            ");
            $vacStmt->execute([
                ':id' => 'f77546e6-aa0f-4346-8b25-e83f644eb134',
                ':title' => 'Desarrollador Full Stack Senior',
                ':type' => 'Tiempo completo',
                ':location' => 'Remoto',
                ':description' => 'Buscamos un desarrollador full stack con experiencia en PHP, FastAPI y JavaScript.',
                ':status' => 'active',
                ':recruiter_id' => '7c8ed709-87fc-404d-9dc3-e118d1f62191',
                ':created_at' => $now,
            ]);
            $vacStmt->execute([
                ':id' => 'e928ec9d-4615-4dd3-ba17-81438fb5b0fd',
                ':title' => 'Líder de Arquitectura de Software & Backend',
                ':type' => 'Tiempo completo',
                ':location' => 'Remoto / Híbrido',
                ':description' => 'Posición de liderazgo técnico responsable del diseño, escalabilidad y resiliencia de la plataforma. Requisitos fundamentales: dominio avanzado en arquitecturas web modernas, microservicios, bases de datos relacionales, contenedores Docker y despliegues en la nube.',
                ':status' => 'active',
                ':recruiter_id' => '7c8ed709-87fc-404d-9dc3-e118d1f62191',
                ':created_at' => $now,
            ]);
        }
    }
}
