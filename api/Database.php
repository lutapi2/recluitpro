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
            @chmod($dbDir, 0777);
            if (file_exists($dbPath)) {
                @chmod($dbPath, 0666);
            }

            try {
                $pdo = new PDO('sqlite:' . $dbPath);
                $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                $pdo->exec('PRAGMA journal_mode = WAL;');
                $pdo->exec('PRAGMA busy_timeout = 5000;');

                self::$instance = $pdo;

                // Disable foreign keys temporarily while ensuring schema and seed data
                $pdo->exec('PRAGMA foreign_keys = OFF;');
                try {
                    self::ensureSchema($pdo);
                } catch (\Throwable $se) {
                    error_log('Database schema initialization error: ' . $se->getMessage());
                } finally {
                    $pdo->exec('PRAGMA foreign_keys = ON;');
                }
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

            CREATE TABLE IF NOT EXISTS document_categories (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                icon VARCHAR(50),
                order_index INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS hv_items (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                application_id VARCHAR(36) NOT NULL,
                category_code VARCHAR(50) NOT NULL,
                title VARCHAR(200) NOT NULL,
                required INTEGER DEFAULT 1,
                status VARCHAR(20) DEFAULT 'aprobado',
                notes TEXT,
                support_doc_id VARCHAR(36),
                created_at DATETIME NOT NULL,
                FOREIGN KEY(application_id) REFERENCES applications (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS help_tickets (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                category VARCHAR(100) NOT NULL,
                subject VARCHAR(200) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'abierto',
                answer TEXT,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        ");

        // Verify and add extra columns in applications if missing
        try {
            $appCols = $pdo->query("PRAGMA table_info(applications)")->fetchAll(PDO::FETCH_ASSOC);
            $appColNames = array_map(fn($c) => strtolower($c['name']), $appCols);
            if (!in_array('department', $appColNames, true)) {
                $pdo->exec("ALTER TABLE applications ADD COLUMN department TEXT DEFAULT 'Facultad de Educación y Ciencias Sociales'");
            }
            if (!in_array('process_type', $appColNames, true)) {
                $pdo->exec("ALTER TABLE applications ADD COLUMN process_type TEXT DEFAULT 'Aspirante Nuevo a docente cátedra'");
            }
            if (!in_array('contract_status', $appColNames, true)) {
                $pdo->exec("ALTER TABLE applications ADD COLUMN contract_status TEXT DEFAULT 'Contratado'");
            }
            if (!in_array('approved_docs_count', $appColNames, true)) {
                $pdo->exec("ALTER TABLE applications ADD COLUMN approved_docs_count INTEGER DEFAULT 22");
            }
            if (!in_array('total_docs_count', $appColNames, true)) {
                $pdo->exec("ALTER TABLE applications ADD COLUMN total_docs_count INTEGER DEFAULT 22");
            }
        } catch (Exception $e) {
            // Ignore if columns exist
        }

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

        // Clean up any orphaned records before seeders or operations
        try {
            $pdo->exec("DELETE FROM auth_sessions WHERE user_id NOT IN (SELECT id FROM users);");
            $pdo->exec("DELETE FROM email_tokens WHERE user_id NOT IN (SELECT id FROM users);");
            $pdo->exec("DELETE FROM documents WHERE owner_id NOT IN (SELECT id FROM users);");
            $pdo->exec("DELETE FROM applications WHERE candidate_id NOT IN (SELECT id FROM users) OR vacancy_id NOT IN (SELECT id FROM vacancies);");
            $pdo->exec("DELETE FROM application_activities WHERE application_id NOT IN (SELECT id FROM applications);");
            $pdo->exec("DELETE FROM hv_items WHERE application_id NOT IN (SELECT id FROM applications);");
            $pdo->exec("DELETE FROM help_tickets WHERE user_id NOT IN (SELECT id FROM users);");
            $pdo->exec("UPDATE vacancies SET recruiter_id = NULL WHERE recruiter_id IS NOT NULL AND recruiter_id NOT IN (SELECT id FROM users);");
            $pdo->exec("UPDATE applications SET assigned_recruiter_id = NULL WHERE assigned_recruiter_id IS NOT NULL AND assigned_recruiter_id NOT IN (SELECT id FROM users);");
        } catch (\Throwable $e) {
            // Ignore if tables do not exist yet
        }

        // Seed initial admin user if not present
        $adminHash = '$argon2id$v=19$m=65536,t=3,p=4$Pdwv0ZiNQ5r3Fa5OnMlvvQ$LbV6GBoRkTNvaMVZ4pwhD7CWeeQ1bb+RvgzAvVjZJP4';
        $adminId = '7c8ed709-87fc-404d-9dc3-e118d1f62191';
        $stmt = $pdo->query("SELECT id FROM users WHERE email = 'luctapi89@gmail.com' LIMIT 1");
        $existingAdmin = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        if (!$existingAdmin) {
            $now = Config::utcNow();
            $adminStmt = $pdo->prepare("
                INSERT INTO users (id, name, email, password_hash, role, created_at, last_activity_at, email_verified_at, privacy_consent_at, privacy_consent_version)
                VALUES (:id, :name, :email, :password_hash, :role, :created_at, :last_activity_at, :email_verified_at, :privacy_consent_at, :privacy_consent_version)
            ");
            $adminStmt->execute([
                ':id' => $adminId,
                ':name' => 'Lucas Tapia',
                ':email' => 'luctapi89@gmail.com',
                ':password_hash' => $adminHash,
                ':role' => 'ADMIN',
                ':created_at' => $now,
                ':last_activity_at' => $now,
                ':email_verified_at' => $now,
                ':privacy_consent_at' => $now,
                ':privacy_consent_version' => Config::PRIVACY_CONSENT_VERSION,
            ]);
        } else {
            $adminId = $existingAdmin['id'];
            $upd = $pdo->prepare("UPDATE users SET password_hash = :hash, role = 'ADMIN' WHERE id = :id");
            $upd->execute([':hash' => $adminHash, ':id' => $adminId]);
        }

        // Seed CECAR institutional admin
        $stmtCecar = $pdo->query("SELECT id FROM users WHERE email = 'admin@cecar.edu.co' LIMIT 1");
        if (!$stmtCecar->fetch()) {
            $now = Config::utcNow();
            $adminStmt2 = $pdo->prepare("
                INSERT INTO users (id, name, email, password_hash, role, created_at, last_activity_at, email_verified_at, privacy_consent_at, privacy_consent_version)
                VALUES (:id, :name, :email, :password_hash, :role, :created_at, :last_activity_at, :email_verified_at, :privacy_consent_at, :privacy_consent_version)
            ");
            $adminStmt2->execute([
                ':id' => 'cecar-admin-001',
                ':name' => 'Administrador CECAR',
                ':email' => 'admin@cecar.edu.co',
                ':password_hash' => $adminHash,
                ':role' => 'ADMIN',
                ':created_at' => $now,
                ':last_activity_at' => $now,
                ':email_verified_at' => $now,
                ':privacy_consent_at' => $now,
                ':privacy_consent_version' => Config::PRIVACY_CONSENT_VERSION,
            ]);
        } else {
            $upd2 = $pdo->prepare("UPDATE users SET password_hash = :hash, role = 'ADMIN' WHERE email = 'admin@cecar.edu.co'");
            $upd2->execute([':hash' => $adminHash]);
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
                ':recruiter_id' => $adminId,
                ':created_at' => $now,
            ]);
            $vacStmt->execute([
                ':id' => 'e928ec9d-4615-4dd3-ba17-81438fb5b0fd',
                ':title' => 'Líder de Arquitectura de Software & Backend',
                ':type' => 'Tiempo completo',
                ':location' => 'Remoto / Híbrido',
                ':description' => 'Posición de liderazgo técnico responsable del diseño, escalabilidad y resiliencia de la plataforma. Requisitos fundamentales: dominio avanzado en arquitecturas web modernas, microservicios, bases de datos relacionales, contenedores Docker y despliegues en la nube.',
                ':status' => 'active',
                ':recruiter_id' => $adminId,
                ':created_at' => $now,
            ]);
        }

        // Seed CECAR Document Categories if empty
        $catCount = (int)$pdo->query("SELECT COUNT(*) FROM document_categories")->fetchColumn();
        if ($catCount === 0) {
            $categories = [
                ['contrato', 'Contrato', 'file-text', 1],
                ['info_personal', 'Información Personal', 'user', 2],
                ['formacion', 'Formación Académica', 'graduation-cap', 3],
                ['experiencia', 'Experiencia Laboral', 'briefcase', 4],
                ['seguridad_social', 'Seguridad Social', 'shield', 5],
                ['info_bancaria', 'Información Bancaria', 'credit-card', 6],
                ['salud_ocupacional', 'Salud Ocupacional', 'activity', 7],
                ['antecedentes', 'Antecedentes Legales', 'scale', 8],
            ];
            $insCat = $pdo->prepare("INSERT INTO document_categories (id, code, name, icon, order_index) VALUES (:id, :code, :name, :icon, :order)");
            foreach ($categories as $cat) {
                $insCat->execute([
                    ':id' => Config::uuid(),
                    ':code' => $cat[0],
                    ':name' => $cat[1],
                    ':icon' => $cat[2],
                    ':order' => $cat[3],
                ]);
            }
        }

        // Seed CECAR sample process & candidate application if no applications exist
        $appCount = (int)$pdo->query("SELECT COUNT(*) FROM applications")->fetchColumn();
        if ($appCount === 0) {
            $now = Config::utcNow();
            $candId = 'a1000000-0000-0000-0000-000000000001';
            $docId = 'd1000000-0000-0000-0000-000000000001';
            $appId = 'app-cecar-docente-001';

            // Candidate user
            $candStmt = $pdo->prepare("SELECT id FROM users WHERE email = 'carlos.mendoza@cecar.edu.co' LIMIT 1");
            $candStmt->execute();
            $existingCand = $candStmt->fetch(PDO::FETCH_ASSOC);
            if (!$existingCand) {
                $pdo->prepare("
                    INSERT INTO users (id, name, email, password_hash, role, phone, location, email_verified_at, last_activity_at, privacy_consent_at, privacy_consent_version, created_at)
                    VALUES (:id, 'Carlos Mendoza Gómez', 'carlos.mendoza@cecar.edu.co', :hash, 'CANDIDATE', '3001234567', 'Sincelejo, Sucre', :now, :now, :now, :ver, :now)
                ")->execute([
                    ':id' => $candId,
                    ':hash' => '$2y$10$abcdefghijklmnopqrstuu',
                    ':now' => $now,
                    ':ver' => Config::PRIVACY_CONSENT_VERSION,
                ]);
            } else {
                $candId = $existingCand['id'];
            }

            // Document
            $docStmt = $pdo->prepare("SELECT id FROM documents WHERE id = :id LIMIT 1");
            $docStmt->execute([':id' => $docId]);
            if (!$docStmt->fetch()) {
                $pdo->prepare("
                    INSERT INTO documents (id, owner_id, original_name, media_type, storage_name, size, created_at, file_data)
                    VALUES (:id, :owner_id, 'HojaDeVida_CarlosMendoza.pdf', 'application/pdf', 'cecar-docente-cv', 145000, :now, NULL)
                ")->execute([
                    ':id' => $docId,
                    ':owner_id' => $candId,
                    ':now' => $now,
                ]);
            }

            // Find valid vacancy
            $vacId = 'f77546e6-aa0f-4346-8b25-e83f644eb134';
            $checkVac = $pdo->prepare("SELECT id FROM vacancies WHERE id = :id LIMIT 1");
            $checkVac->execute([':id' => $vacId]);
            if (!$checkVac->fetch()) {
                $vacId = (string)$pdo->query("SELECT id FROM vacancies LIMIT 1")->fetchColumn();
            }

            // Recruiter
            $recId = $adminId;
            $checkRec = $pdo->prepare("SELECT id FROM users WHERE id = :id LIMIT 1");
            $checkRec->execute([':id' => $recId]);
            if (!$checkRec->fetch()) {
                $recId = null;
            }

            if (!empty($vacId) && !empty($candId) && !empty($docId)) {
                $pdo->prepare("
                    INSERT OR IGNORE INTO applications (
                        id, vacancy_id, candidate_id, name, phone, location, resume_id, status,
                        assigned_recruiter_id, privacy_consent_at, privacy_consent_version,
                        ai_score, ai_verdict, ai_summary, ai_analyzed_at, created_at,
                        department, process_type, contract_status, approved_docs_count, total_docs_count
                    ) VALUES (
                        :id, :vac_id, :cand_id, 'Carlos Mendoza Gómez', '3001234567', 'Sincelejo, Sucre',
                        :doc_id, 'oferta', :rec_id, :now, :ver,
                        94, 'Recomendación Favorable (Nivel Sobresaliente)', 'Expediente docente con acreditación completa.', :now, :now,
                        'Facultad de Educación y Ciencias Sociales', 'Aspirante Nuevo a docente cátedra', 'Contratado', 22, 22
                    )
                ")->execute([
                    ':id' => $appId,
                    ':vac_id' => $vacId,
                    ':cand_id' => $candId,
                    ':doc_id' => $docId,
                    ':rec_id' => $recId,
                    ':now' => $now,
                    ':ver' => Config::PRIVACY_CONSENT_VERSION,
                ]);

                // Check if application exists before inserting hv_items
                $appExists = (bool)$pdo->query("SELECT 1 FROM applications WHERE id = '$appId'")->fetchColumn();
                if ($appExists) {
                    $sampleItems = [
                        ['contrato', 'Minuta de Contrato de Trabajo Docente', 'aprobado'],
                        ['info_personal', 'Cédula de Ciudadanía al 150%', 'aprobado'],
                        ['info_personal', 'Libreta Militar (si aplica)', 'aprobado'],
                        ['info_personal', 'Foto tamaño carnet fondo blanco', 'aprobado'],
                        ['formacion', 'Título de Pregrado (Diploma y Acta de Grado)', 'aprobado'],
                        ['formacion', 'Título de Maestría en Educación', 'aprobado'],
                        ['formacion', 'Título de Especialización en Pedagogía', 'aprobado'],
                        ['formacion', 'Convalidación de Títulos del Exterior (si aplica)', 'aprobado'],
                        ['formacion', 'Certificados de Educación Continuada (>40 hrs)', 'aprobado'],
                        ['experiencia', 'Certificación de Experiencia Docente Universitaria', 'aprobado'],
                        ['seguridad_social', 'Certificado de Afiliación EPS vigente', 'aprobado'],
                        ['seguridad_social', 'Certificado de Afiliación a Fondo de Pensiones', 'aprobado'],
                        ['info_bancaria', 'Certificado Apertura Cuenta Davivienda *', 'aprobado'],
                        ['salud_ocupacional', 'Certificado de Examen Médico Ocupacional de Ingreso', 'aprobado'],
                        ['antecedentes', 'Certificado de Antecedentes Disciplinarios Procuraduría', 'aprobado'],
                        ['antecedentes', 'Certificado de Antecedentes Fiscales Contraloría', 'aprobado'],
                        ['antecedentes', 'Certificado de Antecedentes Judiciales Policía Nacional', 'aprobado'],
                        ['antecedentes', 'Certificado de Medidas Correctivas RNMC', 'aprobado'],
                        ['antecedentes', 'Certificado de Delitos Sexuales en Menores de Edad', 'aprobado'],
                        ['antecedentes', 'Certificado Registro de Deudores Alimentarios Morosos (REDAM)', 'aprobado'],
                        ['antecedentes', 'Declaración Juramentada de Bienes y Rentas', 'aprobado'],
                        ['antecedentes', 'Tarjeta Profesional y Certificado de Vigencia', 'aprobado'],
                    ];

                    $insItem = $pdo->prepare("
                        INSERT INTO hv_items (id, application_id, category_code, title, required, status, notes, support_doc_id, created_at)
                        VALUES (:id, :app_id, :cat, :title, 1, :st, 'Documento verificado y conforme.', :doc_id, :now)
                    ");
                    foreach ($sampleItems as $si) {
                        $insItem->execute([
                            ':id' => Config::uuid(),
                            ':app_id' => $appId,
                            ':cat' => $si[0],
                            ':title' => $si[1],
                            ':st' => $si[2],
                            ':doc_id' => $docId,
                            ':now' => $now,
                        ]);
                    }
                }
            }
        }
    }
}
