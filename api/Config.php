<?php
declare(strict_types=1);

namespace RecruitPro;

use DateTime;
use DateTimeZone;
use Exception;

class Config {
    public const SESSION_COOKIE = 'recruitpro_session';
    public const CSRF_COOKIE = 'recruitpro_csrf';
    public const SESSION_DAYS = 7;
    public const MAX_FILE_SIZE = 10485760; // 10 MB
    public const RETENTION_MONTHS = 24;
    public const PRIVACY_CONSENT_VERSION = '2026-10-neutral-1';

    public static function getRootPath(): string {
        return dirname(__DIR__);
    }

    public static function getDatabasePath(): string {
        $envPath = getenv('DATABASE_PATH') ?: getenv('SQLITE_PATH');
        if (!empty($envPath)) {
            $dir = dirname($envPath);
            if (!is_dir($dir)) {
                @mkdir($dir, 0777, true);
            }
            return $envPath;
        }
        $root = self::getRootPath();
        $dbPath = $root . DIRECTORY_SEPARATOR . 'recruitpro.db';
        return $dbPath;
    }

    public static function getUploadDir(): string {
        $envUpload = getenv('UPLOAD_DIR');
        if (!empty($envUpload)) {
            if (!is_dir($envUpload)) {
                @mkdir($envUpload, 0777, true);
            }
            return $envUpload;
        }
        $root = self::getRootPath();
        // Priority: outside root folder or local recruitpro-data
        $parentData = dirname($root) . DIRECTORY_SEPARATOR . 'recruitpro-data' . DIRECTORY_SEPARATOR . 'private_uploads';
        if (is_dir(dirname($parentData))) {
            return $parentData;
        }
        $localData = $root . DIRECTORY_SEPARATOR . 'recruitpro-data' . DIRECTORY_SEPARATOR . 'private_uploads';
        return $localData;
    }

    public static function isSecureCookie(): bool {
        $env = getenv('ENVIRONMENT') ?: 'development';
        if (strtolower($env) === 'production') {
            return true;
        }
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        return false;
    }

    public static function uuid(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public static function utcNow(): string {
        $now = new DateTime('now', new DateTimeZone('UTC'));
        return $now->format('Y-m-d H:i:s');
    }

    public static function toIso8601(?string $dateStr): ?string {
        if (!$dateStr) {
            return null;
        }
        try {
            $dt = new DateTime($dateStr, new DateTimeZone('UTC'));
            return $dt->format('Y-m-d\TH:i:s\Z');
        } catch (Exception $e) {
            return $dateStr;
        }
    }

    public static function normalizeRoleForClient(string $role): string {
        $lower = strtolower(trim($role));
        if ($lower === 'admin' || $lower === 'administrador') {
            return 'administrador';
        }
        if ($lower === 'recruiter' || $lower === 'reclutador') {
            return 'reclutador';
        }
        return 'candidato';
    }

    public static function normalizeRoleForDb(string $role): string {
        $lower = strtolower(trim($role));
        if ($lower === 'administrador' || $lower === 'admin') {
            return 'ADMIN';
        }
        if ($lower === 'reclutador' || $lower === 'recruiter') {
            return 'RECRUITER';
        }
        return 'CANDIDATE';
    }

    public static function normalizeEmail(string $email): string {
        $normalized = strtolower(trim($email));
        if (!filter_var($normalized, FILTER_VALIDATE_EMAIL)) {
            throw new Exception("Escribe un correo electrónico válido.");
        }
        return $normalized;
    }
}
