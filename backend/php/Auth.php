<?php

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Response.php';

class Auth {
    public static function uuid(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public static function createSession(string $userId): string {
        $db = Database::getConnection();
        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expires = date('Y-m-d H:i:s', time() + 86400 * 7); // 7 days

        $stmt = $db->prepare("INSERT INTO auth_sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)");
        $stmt->execute([self::uuid(), $tokenHash, $userId, $expires]);

        // Also set HTTP-Only cookie for browser sessions
        self::setSessionCookie($rawToken);

        return $rawToken;
    }

    public static function setSessionCookie(string $token): void {
        if (!headers_sent()) {
            setcookie('recruitpro_session', $token, [
                'expires' => time() + 86400 * 7,
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
            setcookie('session', $token, [
                'expires' => time() + 86400 * 7,
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
        }
    }

    public static function clearSessionCookie(): void {
        if (!headers_sent()) {
            setcookie('recruitpro_session', '', [
                'expires' => time() - 3600,
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
            setcookie('session', '', [
                'expires' => time() - 3600,
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
        }
    }

    public static function getUser(): ?array {
        $rawToken = null;

        // 1. Try Bearer header
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            $rawToken = $matches[1];
        }

        // 2. Try Cookie if header not present
        if (!$rawToken) {
            $rawToken = $_COOKIE['recruitpro_session'] ?? $_COOKIE['session'] ?? null;
        }

        if (!$rawToken) {
            return null;
        }

        $tokenHash = hash('sha256', $rawToken);

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT s.id as session_id, s.expires_at, u.* FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? LIMIT 1");
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch();

        if (!$row) return null;

        if (strtotime($row['expires_at']) <= time()) {
            $del = $db->prepare("DELETE FROM auth_sessions WHERE id = ?");
            $del->execute([$row['session_id']]);
            self::clearSessionCookie();
            return null;
        }

        // Update last activity
        $upd = $db->prepare("UPDATE users SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?");
        $upd->execute([$row['id']]);

        return $row;
    }

    public static function requireUser(): array {
        $user = self::getUser();
        if (!$user) {
            Response::error("No autenticado o sesión expirada.", 401);
        }
        return $user;
    }

    public static function normalizeRole(string $role): string {
        $r = strtolower(trim($role));
        if (str_starts_with($r, 'role.')) $r = substr($r, 5);
        $map = [
            'admin' => 'administrador',
            'administrator' => 'administrador',
            'administrador' => 'administrador',
            'recruiter' => 'reclutador',
            'reclutador' => 'reclutador',
            'candidate' => 'candidato',
            'candidato' => 'candidato',
            'talento_humano' => 'talento_humano',
            'reviewer' => 'revisor',
            'revisor' => 'revisor',
            'interviewer' => 'entrevistador',
            'entrevistador' => 'entrevistador',
            'academic_lead' => 'lider_academico',
            'lider_academico' => 'lider_academico'
        ];
        return $map[$r] ?? $r;
    }

    public static function requireRole(array $allowedRoles): array {
        $user = self::requireUser();
        $normalizedUserRole = self::normalizeRole($user['role'] ?? '');
        $normalizedAllowed = array_map([self::class, 'normalizeRole'], $allowedRoles);

        if (!in_array($normalizedUserRole, $normalizedAllowed, true)) {
            Response::error("Acceso denegado: rol insuficiente.", 403);
        }
        return $user;
    }

    public static function userData(array $user): array {
        return [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => self::normalizeRole($user['role']),
            'faculty' => $user['faculty'] ?? '',
            'campus' => $user['campus'] ?? 'Sede Principal Sincelejo',
            'phone' => $user['phone'] ?? '',
            'isActive' => !empty($user['is_active']),
            'emailVerified' => !empty($user['email_verified_at']),
            'emailVerifiedAt' => $user['email_verified_at'] ?? null,
            'createdAt' => $user['created_at'] ?? null
        ];
    }
}
