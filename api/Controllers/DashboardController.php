<?php
declare(strict_types=1);

namespace RecruitPro\Controllers;

use PDO;
use RecruitPro\Config;
use RecruitPro\Database;
use RecruitPro\Response;
use RecruitPro\Security;

require_once __DIR__ . '/../Config.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Security.php';

class DashboardController {
    public static function summary(): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        $viewerRole = Config::normalizeRoleForClient($viewer['role']);

        if ($viewerRole === 'candidato') {
            $vacCount = (int)$pdo->query("SELECT COUNT(*) FROM vacancies WHERE status = 'active'")->fetchColumn();
            $appStmt = $pdo->prepare("SELECT COUNT(*) FROM applications WHERE candidate_id = :cid");
            $appStmt->execute([':cid' => $viewer['id']]);
            $appCount = (int)$appStmt->fetchColumn();

            Response::json([
                'vacancies' => $vacCount,
                'applications' => $appCount,
            ]);
        }

        if ($viewerRole === 'reclutador') {
            $vacStmt = $pdo->prepare("SELECT COUNT(*) FROM vacancies WHERE recruiter_id = :rid");
            $vacStmt->execute([':rid' => $viewer['id']]);
            $vacCount = (int)$vacStmt->fetchColumn();

            $appStmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM applications a 
                JOIN vacancies v ON a.vacancy_id = v.id 
                WHERE v.recruiter_id = :rid
            ");
            $appStmt->execute([':rid' => $viewer['id']]);
            $appCount = (int)$appStmt->fetchColumn();

            Response::json([
                'vacancies' => $vacCount,
                'applications' => $appCount,
            ]);
        }

        // Admin
        $totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $candidates = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'CANDIDATE' OR role = 'candidato'")->fetchColumn();
        $recruiters = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'RECRUITER' OR role = 'reclutador'")->fetchColumn();
        $vacancies = (int)$pdo->query("SELECT COUNT(*) FROM vacancies")->fetchColumn();

        Response::json([
            'users' => $totalUsers,
            'candidates' => $candidates,
            'recruiters' => $recruiters,
            'vacancies' => $vacancies,
        ]);
    }
}
