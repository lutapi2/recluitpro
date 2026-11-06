<?php

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Response.php';

class Auth {
    public static function createSession(string $userId): string {
        $db = Database::getConnection();
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $sessionId = self::uuid();
        $expiresAt = date('Y-m-d H:i:s', time() + (30 * 86400)); // 30 days

        $stmt = $db->prepare("INSERT INTO auth_sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$sessionId, $tokenHash, $userId, $expiresAt, date('Y-m-d H:i:s')]);

        return $token;
    }

    public static function getUser(): ?array {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        
        if (!preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            return null;
        }

        $rawToken = $matches[1];
        $tokenHash = hash('sha256', $rawToken);

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT s.id as session_id, s.expires_at, u.* FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? LIMIT 1");
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch();

        if (!$row) return null;

        if (strtotime($row['expires_at']) <= time()) {
            $del = $db->prepare("DELETE FROM auth_sessions WHERE id = ?");
            $del->execute([$row['session_id']]);
            return null;
        }

        // Update last activity
        $upd = $db->prepare("UPDATE users SET last_activity_at = ? WHERE id = ?");
        $upd->execute([date('Y-m-d H:i:s'), $row['id']]);

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
        return match ($r) {
            'admin', 'role.admin' => 'administrador',
            'recruiter', 'role.recruiter' => 'reclutador',
            'candidate', 'role.candidate' => 'candidato',
            default => $r
        };
    }

    public static function requireRole(array $allowedRoles): array {
        $user = self::requireUser();
        $userRole = self::normalizeRole($user['role'] ?? '');
        $allowed = array_map([self::class, 'normalizeRole'], $allowedRoles);

        if (!in_array($userRole, $allowed)) {
            Response::error("No tienes permisos suficientes para realizar esta acción.", 403);
        }
        return $user;
    }

    public static function userData(array $user): array {
        $db = Database::getConnection();
        $docsStmt = $db->prepare("SELECT id, original_name as name, media_type as type, size FROM documents WHERE owner_id = ?");
        $docsStmt->execute([$user['id']]);
        $docs = $docsStmt->fetchAll();

        return [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => self::normalizeRole($user['role']),
            'phone' => $user['phone'] ?? '',
            'location' => $user['location'] ?? '',
            'faculty' => $user['faculty'] ?? 'Facultad de Educación y Ciencias Sociales',
            'campus' => $user['campus'] ?? 'Sede Principal Sincelejo',
            'emailVerified' => !empty($user['email_verified_at']),
            'privacyConsentAt' => $user['privacy_consent_at'] ?? null,
            'privacyConsentVersion' => $user['privacy_consent_version'] ?? '3.0',
            'documents' => $docs ?: []
        ];
    }

    public static function uuid(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // set version to 0100
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // set bits 6-7 to 10
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
