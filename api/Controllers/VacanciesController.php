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

require_once __DIR__ . '/../Config.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Security.php';
require_once __DIR__ . '/../Serialization.php';

class VacanciesController {
    public static function listVacancies(array $params): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        $viewerRole = Config::normalizeRoleForClient($viewer['role']);

        $q = trim($params['q'] ?? '');
        $location = trim($params['location'] ?? '');
        $vacancyType = trim($params['vacancy_type'] ?? '');
        $statusFilter = trim($params['status_filter'] ?? '');
        $sort = $params['sort'] ?? 'created_at';
        $order = strtolower($params['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';
        $page = max(1, (int)($params['page'] ?? 1));
        $pageSize = min(100, max(1, (int)($params['page_size'] ?? 20)));
        $offset = ($page - 1) * $pageSize;

        $conditions = [];
        $bindings = [];

        if ($viewerRole === 'candidato') {
            $conditions[] = "v.status = 'active'";
            if (!empty($statusFilter) && $statusFilter !== 'active') {
                Response::error("Los candidatos solo pueden buscar vacantes activas.", 400);
            }
        } elseif ($viewerRole === 'reclutador') {
            $conditions[] = "(v.recruiter_id = :recruiter_id OR EXISTS (SELECT 1 FROM applications a WHERE a.vacancy_id = v.id AND a.assigned_recruiter_id = :recruiter_id2))";
            $bindings[':recruiter_id'] = $viewer['id'];
            $bindings[':recruiter_id2'] = $viewer['id'];
            if (!empty($statusFilter)) {
                $conditions[] = "v.status = :status_filter";
                $bindings[':status_filter'] = $statusFilter;
            }
        } else {
            // Admin
            if (!empty($statusFilter)) {
                $conditions[] = "v.status = :status_filter";
                $bindings[':status_filter'] = $statusFilter;
            }
        }

        if (!empty($q)) {
            $conditions[] = "(v.title LIKE :q OR v.description LIKE :q2 OR v.type LIKE :q3)";
            $bindings[':q'] = "%$q%";
            $bindings[':q2'] = "%$q%";
            $bindings[':q3'] = "%$q%";
        }

        if (!empty($location)) {
            $conditions[] = "v.location LIKE :loc";
            $bindings[':loc'] = "%$location%";
        }

        if (!empty($vacancyType)) {
            $conditions[] = "v.type LIKE :vtype";
            $bindings[':vtype'] = "%$vacancyType%";
        }

        $whereClause = !empty($conditions) ? "WHERE " . implode(" AND ", $conditions) : "";

        // Total count
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM vacancies v $whereClause");
        $countStmt->execute($bindings);
        $total = (int)$countStmt->fetchColumn();

        // Sort column map
        $sortColMap = [
            'created_at' => 'v.created_at',
            'title' => 'v.title',
            'location' => 'v.location',
            'type' => 'v.type',
        ];
        $sortCol = $sortColMap[$sort] ?? 'v.created_at';

        $sql = "SELECT v.* FROM vacancies v $whereClause ORDER BY $sortCol $order, v.id LIMIT $pageSize OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($bindings);
        $vacancies = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $items = [];
        foreach ($vacancies as $vac) {
            $items[] = Serialization::vacancyData($vac, $pdo, $viewer);
        }

        Response::json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
        ]);
    }

    public static function createVacancy(array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador', 'reclutador']);

        $status = $body['status'] ?? 'active';
        if ($status !== 'active') {
            Response::error("Una vacante nueva debe estar activa.", 422);
        }

        $title = trim($body['title'] ?? '');
        $type = trim($body['type'] ?? '');
        $location = trim($body['location'] ?? '');
        $description = trim($body['description'] ?? '');

        if (empty($title) || empty($type) || empty($description)) {
            Response::error("Completa los campos obligatorios.", 422);
        }

        $viewerRole = Config::normalizeRoleForClient($viewer['role']);
        $recruiterId = ($viewerRole === 'reclutador') ? $viewer['id'] : null;

        if ($viewerRole === 'administrador' && !empty($body['recruiter_id'])) {
            $recStmt = $pdo->prepare("SELECT id, role FROM users WHERE id = :id LIMIT 1");
            $recStmt->execute([':id' => $body['recruiter_id']]);
            $recUser = $recStmt->fetch(PDO::FETCH_ASSOC);
            if (!$recUser || Config::normalizeRoleForClient($recUser['role']) !== 'reclutador') {
                Response::error("Selecciona un reclutador válido.", 422);
            }
            $recruiterId = $recUser['id'];
        }

        $vacId = Config::uuid();
        $now = Config::utcNow();

        $stmt = $pdo->prepare("
            INSERT INTO vacancies (id, title, type, location, description, status, recruiter_id, created_at)
            VALUES (:id, :title, :type, :location, :description, :status, :recruiter_id, :created_at)
        ");
        $stmt->execute([
            ':id' => $vacId,
            ':title' => $title,
            ':type' => $type,
            ':location' => $location,
            ':description' => $description,
            ':status' => 'active',
            ':recruiter_id' => $recruiterId,
            ':created_at' => $now,
        ]);

        $getStmt = $pdo->prepare("SELECT * FROM vacancies WHERE id = :id");
        $getStmt->execute([':id' => $vacId]);
        $vac = $getStmt->fetch(PDO::FETCH_ASSOC);

        Response::json(Serialization::vacancyData($vac, $pdo, $viewer), 201);
    }

    public static function updateVacancy(string $vacancyId, array $body): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador', 'reclutador']);

        $stmt = $pdo->prepare("SELECT * FROM vacancies WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $vacancyId]);
        $vacancy = $stmt->fetch(PDO::FETCH_ASSOC);

        $viewerRole = Config::normalizeRoleForClient($viewer['role']);
        if (!$vacancy || ($viewerRole === 'reclutador' && ($vacancy['recruiter_id'] ?? '') !== $viewer['id'])) {
            Response::error("No se encontró una vacante editable.", 404);
        }

        $status = $body['status'] ?? $vacancy['status'];
        if (!in_array($status, ['active', 'closed'], true)) {
            Response::error("El estado de la vacante no es válido.", 422);
        }

        $title = trim($body['title'] ?? $vacancy['title']);
        $type = trim($body['type'] ?? $vacancy['type']);
        $location = trim($body['location'] ?? $vacancy['location']);
        $description = trim($body['description'] ?? $vacancy['description']);

        $recruiterId = $vacancy['recruiter_id'];
        if ($viewerRole === 'administrador') {
            if (!empty($body['recruiter_id'])) {
                $recStmt = $pdo->prepare("SELECT id, role FROM users WHERE id = :id LIMIT 1");
                $recStmt->execute([':id' => $body['recruiter_id']]);
                $recUser = $recStmt->fetch(PDO::FETCH_ASSOC);
                if (!$recUser || Config::normalizeRoleForClient($recUser['role']) !== 'reclutador') {
                    Response::error("Selecciona un reclutador válido.", 422);
                }
                $recruiterId = $recUser['id'];
            } else {
                $recruiterId = null;
            }
        }

        $upd = $pdo->prepare("
            UPDATE vacancies 
            SET title = :title, type = :type, location = :location, description = :description, status = :status, recruiter_id = :recruiter_id
            WHERE id = :id
        ");
        $upd->execute([
            ':title' => $title,
            ':type' => $type,
            ':location' => $location,
            ':description' => $description,
            ':status' => $status,
            ':recruiter_id' => $recruiterId,
            ':id' => $vacancyId,
        ]);

        $getStmt = $pdo->prepare("SELECT * FROM vacancies WHERE id = :id");
        $getStmt->execute([':id' => $vacancyId]);
        $updatedVac = $getStmt->fetch(PDO::FETCH_ASSOC);

        Response::json(Serialization::vacancyData($updatedVac, $pdo, $viewer));
    }

    public static function deleteVacancy(string $vacancyId): void {
        Security::verifyCsrf();
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador']);

        $stmt = $pdo->prepare("SELECT id FROM vacancies WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $vacancyId]);
        if (!$stmt->fetch()) {
            Response::error("No se encontró la vacante a eliminar.", 404);
        }

        // Clean up associated applications and items
        $appIdsStmt = $pdo->prepare("SELECT id FROM applications WHERE vacancy_id = :id");
        $appIdsStmt->execute([':id' => $vacancyId]);
        $appIds = $appIdsStmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($appIds as $aid) {
            $pdo->prepare("DELETE FROM hv_items WHERE application_id = :aid")->execute([':aid' => $aid]);
            $pdo->prepare("DELETE FROM application_activities WHERE application_id = :aid")->execute([':aid' => $aid]);
            $pdo->prepare("DELETE FROM applications WHERE id = :aid")->execute([':aid' => $aid]);
        }

        $del = $pdo->prepare("DELETE FROM vacancies WHERE id = :id");
        $del->execute([':id' => $vacancyId]);

        Response::noContent();
    }

    public static function listPublicVacancies(array $params): void {
        $pdo = Database::getConnection();

        $q = trim($params['q'] ?? '');
        $location = trim($params['location'] ?? '');
        $vacancyType = trim($params['vacancy_type'] ?? '');

        $conditions = ["status = 'active'"];
        $bindings = [];

        if (!empty($q)) {
            $conditions[] = "(title LIKE :q OR description LIKE :q2)";
            $bindings[':q'] = "%$q%";
            $bindings[':q2'] = "%$q%";
        }

        if (!empty($location)) {
            $conditions[] = "location LIKE :loc";
            $bindings[':loc'] = "%$location%";
        }

        if (!empty($vacancyType)) {
            $conditions[] = "type LIKE :vtype";
            $bindings[':vtype'] = "%$vacancyType%";
        }

        $whereClause = "WHERE " . implode(" AND ", $conditions);
        $sql = "SELECT id, title, type, location, description, created_at FROM vacancies $whereClause ORDER BY created_at DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($bindings);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $items = [];
        foreach ($rows as $r) {
            $items[] = [
                'id' => $r['id'],
                'title' => $r['title'],
                'type' => $r['type'],
                'location' => $r['location'],
                'description' => $r['description'],
                'createdAt' => Config::toIso8601($r['created_at']),
            ];
        }

        Response::json(['items' => $items]);
    }
}
