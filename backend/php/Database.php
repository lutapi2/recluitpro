<?php

class Database {
    private static ?PDO $pdo = null;
    private static string $driver = 'mysql';

    public static function getConnection(): PDO {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        // 1. Check for MySQL configuration
        $dbUrl = getenv('MYSQL_URL') ?: getenv('DATABASE_URL');
        $host = getenv('DB_HOST') ?: '127.0.0.1';
        $port = getenv('DB_PORT') ?: '3306';
        $dbName = getenv('DB_NAME') ?: 'recruitpro';
        $user = getenv('DB_USER') ?: 'root';
        $pass = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : (getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');

        if ($dbUrl && (str_starts_with($dbUrl, 'mysql://') || str_starts_with($dbUrl, 'mysql2://'))) {
            $parsed = parse_url($dbUrl);
            $host = $parsed['host'] ?? $host;
            $port = $parsed['port'] ?? $port;
            $user = $parsed['user'] ?? $user;
            $pass = $parsed['pass'] ?? $pass;
            $dbName = ltrim($parsed['path'] ?? '', '/') ?: $dbName;
        }

        // Try MySQL
        $mysqlSuccess = false;
        try {
            $dsn = "mysql:host={$host};port={$port};charset=utf8mb4";
            $tempPdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 2
            ]);
            $tempPdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            unset($tempPdo);

            self::$pdo = new PDO("mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_MULTI_STATEMENTS => true
            ]);
            self::$driver = 'mysql';
            $mysqlSuccess = true;
        } catch (Exception) {
            $mysqlSuccess = false;
        }

        if (!$mysqlSuccess) {
            // Find existing recruitpro.db with data
            $candidates = [
                __DIR__ . '/../../recruitpro.db',
                __DIR__ . '/../../../recruitpro.db',
                __DIR__ . '/../../../recluitpro-main/recruitpro.db',
                dirname(__DIR__, 2) . '/recruitpro.db'
            ];
            $sqlitePath = $candidates[0];
            foreach ($candidates as $c) {
                if (file_exists($c) && filesize($c) > 1000) {
                    $sqlitePath = $c;
                    break;
                }
            }

            self::$pdo = new PDO("sqlite:{$sqlitePath}", null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            self::$pdo->exec("PRAGMA foreign_keys = ON;");
            self::$driver = 'sqlite';
        }

        self::ensureSchema();
        return self::$pdo;
    }

    public static function getDriver(): string {
        return self::$driver;
    }

    private static function ensureSchema(): void {
        if (!self::$pdo) return;

        $tableExists = false;
        try {
            if (self::$driver === 'mysql') {
                $check = self::$pdo->query("SHOW TABLES LIKE 'vacancies'")->fetch();
                $tableExists = !empty($check);
            } else {
                $check = self::$pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name='vacancies'")->fetch();
                $tableExists = !empty($check);
            }
        } catch (Exception) {
            $tableExists = false;
        }

        if (!$tableExists && self::$driver === 'mysql') {
            $sqlCandidates = [
                __DIR__ . '/../schema_mysql.sql',
                __DIR__ . '/../../backend/schema_mysql.sql',
                dirname(__DIR__) . '/schema_mysql.sql'
            ];
            foreach ($sqlCandidates as $sqlFile) {
                if (file_exists($sqlFile)) {
                    $sql = file_get_contents($sqlFile);
                    $statements = array_filter(array_map('trim', explode(';', $sql)));
                    foreach ($statements as $st) {
                        if (!empty($st)) {
                            try {
                                self::$pdo->exec($st);
                            } catch (Exception) {
                                // ignore individual statement warnings
                            }
                        }
                    }
                    break;
                }
            }
        }

        // Ensure users seed
        try {
            $stmt = self::$pdo->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute(['admin@recruitpro.internal']);
            if (!$stmt->fetch()) {
                $hash = password_hash('admin-password-1234', PASSWORD_DEFAULT);
                $ins = self::$pdo->prepare("INSERT INTO users (id, name, email, password_hash, role, faculty, campus, email_verified_at, created_at) VALUES (?, ?, ?, ?, 'administrador', 'Gestión del Talento Humano', 'Sede Principal Sincelejo', ?, ?)");
                $ins->execute([
                    'a0000000-0000-0000-0000-000000000001',
                    'Administrador CECAR',
                    'admin@recruitpro.internal',
                    $hash,
                    date('Y-m-d H:i:s'),
                    date('Y-m-d H:i:s')
                ]);
            }

            $stmt->execute(['luctapi89@gmail.com']);
            if (!$stmt->fetch()) {
                $hash = '$argon2id$v=19$m=65536,t=3,p=4$dvtLAEUGZ96eW00Sc5pHMA$XMZ5CBcyF0c0DanwRCg6DConjnhetEAo56HEd9jgv/c';
                $ins = self::$pdo->prepare("INSERT INTO users (id, name, email, password_hash, role, faculty, campus, email_verified_at, created_at) VALUES (?, ?, ?, ?, 'administrador', 'Facultad de Educación y Ciencias Sociales', 'Sede Principal Sincelejo', ?, ?)");
                $ins->execute([
                    '7c8ed709-87fc-404d-9dc3-e118d1f62191',
                    'Lucas Tapia',
                    'luctapi89@gmail.com',
                    $hash,
                    date('Y-m-d H:i:s'),
                    date('Y-m-d H:i:s')
                ]);
            }
        } catch (Exception) {
            // pass
        }
    }
}
