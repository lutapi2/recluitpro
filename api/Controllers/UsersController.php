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

class UsersController {
    public static function listUsers(array $params): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        $viewerRole = Config::normalizeRoleForClient($viewer['role']);

        $roleFilter = $params['role'] ?? 'candidato';
        $normalizedTargetRole = Config::normalizeRoleForClient($roleFilter);

        if ($normalizedTargetRole === 'candidato') {
            Security::requireRole($viewer, ['administrador', 'reclutador']);
        } elseif ($normalizedTargetRole === 'reclutador') {
            Security::requireRole($viewer, ['administrador']);
        } else {
            Response::error("Filtro de usuarios no válido.", 400);
        }

        $q = trim($params['q'] ?? '');
        $location = trim($params['location'] ?? '');
        $statusFilter = trim($params['status_filter'] ?? '');
        $vacancyId = trim($params['vacancy_id'] ?? '');
        $sort = $params['sort'] ?? 'created_at';
        $order = strtolower($params['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';
        $page = max(1, (int)($params['page'] ?? 1));
        $pageSize = min(100, max(1, (int)($params['page_size'] ?? 20)));
        $offset = ($page - 1) * $pageSize;

        $conditions = [
            "(u.role = :role1 OR u.role = :role2)",
            "u.email_verified_at IS NOT NULL"
        ];
        $bindings = [
            ':role1' => Config::normalizeRoleForDb($normalizedTargetRole),
            ':role2' => $normalizedTargetRole,
        ];

        if ($viewerRole === 'reclutador') {
            $conditions[] = "EXISTS (
                SELECT 1 FROM applications a 
                JOIN vacancies v ON a.vacancy_id = v.id 
                WHERE a.candidate_id = u.id 
                AND (v.recruiter_id = :recruiter_id OR a.assigned_recruiter_id = :recruiter_id2)
            )";
            $bindings[':recruiter_id'] = $viewer['id'];
            $bindings[':recruiter_id2'] = $viewer['id'];
        }

        if (!empty($q)) {
            $conditions[] = "(u.name LIKE :q OR u.email LIKE :q2)";
            $bindings[':q'] = "%$q%";
            $bindings[':q2'] = "%$q%";
        }

        if (!empty($location)) {
            $conditions[] = "u.location LIKE :loc";
            $bindings[':loc'] = "%$location%";
        }

        if (!empty($statusFilter) || !empty($vacancyId)) {
            $appConditions = ["a.candidate_id = u.id"];
            if (!empty($statusFilter)) {
                $appConditions[] = "a.status = :app_status";
                $bindings[':app_status'] = $statusFilter;
            }
            if (!empty($vacancyId)) {
                $appConditions[] = "a.vacancy_id = :vac_id";
                $bindings[':vac_id'] = $vacancyId;
            }
            if ($viewerRole === 'reclutador') {
                $appConditions[] = "(v.recruiter_id = :recruiter_id3 OR a.assigned_recruiter_id = :recruiter_id4)";
                $bindings[':recruiter_id3'] = $viewer['id'];
                $bindings[':recruiter_id4'] = $viewer['id'];
            }
            $conditions[] = "EXISTS (SELECT 1 FROM applications a JOIN vacancies v ON a.vacancy_id = v.id WHERE " . implode(" AND ", $appConditions) . ")";
        }

        $whereClause = "WHERE " . implode(" AND ", $conditions);

        $countStmt = $pdo->prepare("SELECT COUNT(DISTINCT u.id) FROM users u $whereClause");
        $countStmt->execute($bindings);
        $total = (int)$countStmt->fetchColumn();

        $sortCol = ($sort === 'name') ? 'u.name' : 'u.created_at';
        $sql = "SELECT u.* FROM users u $whereClause ORDER BY $sortCol $order, u.id LIMIT $pageSize OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($bindings);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $items = [];
        foreach ($users as $user) {
            $items[] = Serialization::userData($user, $pdo, $viewer);
        }

        Response::json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
        ]);
    }

    public static function updateUser(string $userId, array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador']);

        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $userId]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);

        $accountRole = Config::normalizeRoleForClient($account['role'] ?? '');
        if (!$account || !in_array($accountRole, ['candidato', 'reclutador'], true)) {
            Response::error("No se encontró un perfil editable.", 404);
        }

        try {
            $newEmail = Config::normalizeEmail($body['email'] ?? '');
        } catch (Exception $e) {
            Response::error("Escribe un correo electrónico válido.", 422);
        }

        $name = trim($body['name'] ?? '');
        if (empty($name)) {
            Response::error("Escribe un nombre.", 422);
        }

        $changedEmail = (strtolower($account['email']) !== strtolower($newEmail));
        if ($changedEmail) {
            $checkUnique = $pdo->prepare("SELECT id FROM users WHERE email = :email AND id != :id LIMIT 1");
            $checkUnique->execute([':email' => $newEmail, ':id' => $userId]);
            if ($checkUnique->fetch()) {
                Response::error("Ya existe una cuenta con ese correo.", 409);
            }
        }

        $upd = $pdo->prepare("
            UPDATE users 
            SET name = :name, email = :email, email_verified_at = :verified 
            WHERE id = :id
        ");
        $upd->execute([
            ':name' => $name,
            ':email' => $newEmail,
            ':verified' => $changedEmail ? null : $account['email_verified_at'],
            ':id' => $userId,
        ]);

        $emailSent = true;
        if ($changedEmail) {
            // Revoke active sessions for updated user
            $pdo->prepare("DELETE FROM auth_sessions WHERE user_id = :id")->execute([':id' => $userId]);

            // Issue verification token
            $token = bin2hex(random_bytes(24));
            $expires = date('Y-m-d H:i:s', time() + 86400);
            $insToken = $pdo->prepare("
                INSERT INTO email_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
                VALUES (:id, :uid, :thash, 'verify_email', :exp, :now)
            ");
            $insToken->execute([
                ':id' => Config::uuid(),
                ':uid' => $userId,
                ':thash' => Security::hashToken($token),
                ':exp' => $expires,
                ':now' => Config::utcNow(),
            ]);

            $baseUrl = (isset($_SERVER['HTTPS']) ? "https://" : "http://") . ($_SERVER['HTTP_HOST'] ?? '127.0.0.1:8000');
            $emailSent = EmailService::sendAccountEmail(
                $newEmail,
                "Verifica tu correo de RecruitPro",
                "Confirma tu nueva dirección de correo",
                "Un administrador actualizó tu correo. Verifícalo para volver a iniciar sesión.",
                "$baseUrl/verificar.html?token=" . rawurlencode($token)
            );
        }

        $stmt->execute([':id' => $userId]);
        $updatedAccount = $stmt->fetch(PDO::FETCH_ASSOC);

        $res = Serialization::userData($updatedAccount, $pdo, $viewer);
        $res['emailSent'] = $emailSent;
        Response::json($res);
    }

    public static function promoteRecruiter(string $userId): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador']);

        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $userId]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);

        $targetRole = Config::normalizeRoleForClient($account['role'] ?? '');
        if (!$account || $targetRole !== 'candidato') {
            Response::error("No se encontró un candidato para habilitar.", 404);
        }

        $upd = $pdo->prepare("UPDATE users SET role = 'RECRUITER' WHERE id = :id");
        $upd->execute([':id' => $userId]);

        $stmt->execute([':id' => $userId]);
        $refreshed = $stmt->fetch(PDO::FETCH_ASSOC);

        Response::json(Serialization::userData($refreshed, $pdo, $viewer));
    }

    public static function deleteUser(string $userId): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador']);

        if ($userId === $viewer['id']) {
            Response::error("No puedes eliminar tu propia cuenta de administrador desde aquí.", 400);
        }

        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $userId]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$account) {
            Response::error("Usuario no encontrado.", 404);
        }

        // 1. Delete application activities & applications
        $appIdsStmt = $pdo->prepare("SELECT id FROM applications WHERE candidate_id = :uid");
        $appIdsStmt->execute([':uid' => $userId]);
        $appIds = $appIdsStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($appIds as $aId) {
            $pdo->prepare("DELETE FROM hv_items WHERE application_id = :aid")->execute([':aid' => $aId]);
            $pdo->prepare("DELETE FROM application_activities WHERE application_id = :aid")->execute([':aid' => $aId]);
            $pdo->prepare("DELETE FROM applications WHERE id = :aid")->execute([':aid' => $aId]);
        }

        // 2. Reassign vacancies if recruiter
        $pdo->prepare("UPDATE vacancies SET recruiter_id = :admin_id WHERE recruiter_id = :uid")
            ->execute([':admin_id' => $viewer['id'], ':uid' => $userId]);
        $pdo->prepare("UPDATE applications SET assigned_recruiter_id = NULL WHERE assigned_recruiter_id = :uid")
            ->execute([':uid' => $userId]);

        // 3. Document files
        $docStmt = $pdo->prepare("SELECT storage_name FROM documents WHERE owner_id = :uid");
        $docStmt->execute([':uid' => $userId]);
        $storageNames = $docStmt->fetchAll(PDO::FETCH_COLUMN);

        $uploadDir = Config::getUploadDir();
        $pdo->prepare("DELETE FROM documents WHERE owner_id = :uid")->execute([':uid' => $userId]);

        // 4. Delete sessions, tokens, help tickets, user
        $pdo->prepare("DELETE FROM auth_sessions WHERE user_id = :uid")->execute([':uid' => $userId]);
        $pdo->prepare("DELETE FROM email_tokens WHERE user_id = :uid")->execute([':uid' => $userId]);
        $pdo->prepare("DELETE FROM help_tickets WHERE user_id = :uid")->execute([':uid' => $userId]);
        $pdo->prepare("DELETE FROM users WHERE id = :uid")->execute([':uid' => $userId]);

        foreach ($storageNames as $sname) {
            $fpath = $uploadDir . DIRECTORY_SEPARATOR . $sname;
            if (is_file($fpath)) {
                @unlink($fpath);
            }
        }

        Response::noContent();
    }
}
