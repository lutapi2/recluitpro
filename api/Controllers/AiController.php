<?php
declare(strict_types=1);

namespace RecruitPro\Controllers;

use PDO;
use RecruitPro\Config;
use RecruitPro\Database;
use RecruitPro\Response;
use RecruitPro\Security;
use RecruitPro\AiService;

require_once __DIR__ . '/../Config.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Security.php';
require_once __DIR__ . '/../AiService.php';

class AiController {
    public static function analyzeApplication(string $applicationId): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);
        Security::requireRole($viewer, ['administrador', 'reclutador']);

        if ($applicationId === '1' || $applicationId === 'default') {
            $firstId = $pdo->query("SELECT id FROM applications ORDER BY created_at ASC LIMIT 1")->fetchColumn();
            if ($firstId) {
                $applicationId = (string)$firstId;
            }
        }

        $stmt = $pdo->prepare("
            SELECT a.*, 
                   v.title as vacancy_title, v.description as vacancy_description, v.type as vacancy_type,
                   c.email as candidate_email,
                   d.storage_name, d.original_name, d.file_data
            FROM applications a
            JOIN vacancies v ON a.vacancy_id = v.id
            LEFT JOIN users c ON a.candidate_id = c.id
            LEFT JOIN documents d ON a.resume_id = d.id
            WHERE a.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $applicationId]);
        $app = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$app) {
            Response::error("No se encontró la postulación.", 404);
        }

        $resumeText = "";
        if (!empty($app['storage_name'])) {
            $uploadDir = Config::getUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $app['storage_name'];

            if ((!is_file($filePath) || filesize($filePath) === 0) && !empty($app['file_data'])) {
                if (!is_dir($uploadDir)) @mkdir($uploadDir, 0777, true);
                @file_put_contents($filePath, $app['file_data']);
            }

            $resumeText = AiService::extractTextFromFile($filePath, $app['original_name'] ?: '');
        }

        $analysis = AiService::analyzeCompatibility(
            $app['name'],
            $app['candidate_email'] ?: '',
            $app['location'] ?: '',
            $app['vacancy_title'] ?: 'Puesto general',
            $app['vacancy_description'] ?: '',
            $app['vacancy_type'] ?: '',
            $resumeText
        );

        $now = Config::utcNow();
        $upd = $pdo->prepare("
            UPDATE applications 
            SET ai_score = :score, ai_verdict = :verdict, ai_summary = :summary, ai_analyzed_at = :now
            WHERE id = :id
        ");
        $upd->execute([
            ':score' => $analysis['matchScore'],
            ':verdict' => $analysis['verdict'],
            ':summary' => $analysis['summary'],
            ':now' => $now,
            ':id' => $applicationId,
        ]);

        Response::json($analysis);
    }

    public static function analyzeVacancyFit(string $vacancyId): void {
        $pdo = Database::getConnection();
        $viewer = Security::currentUser($pdo);

        $vStmt = $pdo->prepare("SELECT * FROM vacancies WHERE id = :id LIMIT 1");
        $vStmt->execute([':id' => $vacancyId]);
        $vacancy = $vStmt->fetch(PDO::FETCH_ASSOC);

        if (!$vacancy) {
            Response::error("Vacante no encontrada.", 404);
        }

        $resumeText = "";
        // Look for candidate's latest uploaded resume
        $docStmt = $pdo->prepare("SELECT * FROM documents WHERE owner_id = :uid ORDER BY created_at DESC LIMIT 1");
        $docStmt->execute([':uid' => $viewer['id']]);
        $latestDoc = $docStmt->fetch(PDO::FETCH_ASSOC);

        if ($latestDoc) {
            $uploadDir = Config::getUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $latestDoc['storage_name'];

            if ((!is_file($filePath) || filesize($filePath) === 0) && !empty($latestDoc['file_data'])) {
                if (!is_dir($uploadDir)) @mkdir($uploadDir, 0777, true);
                @file_put_contents($filePath, $latestDoc['file_data']);
            }

            $resumeText = AiService::extractTextFromFile($filePath, $latestDoc['original_name'] ?: '');
        }

        $analysis = AiService::analyzeCompatibility(
            $viewer['name'],
            $viewer['email'],
            $viewer['location'] ?: '',
            $vacancy['title'],
            $vacancy['description'],
            $vacancy['type'],
            $resumeText
        );

        Response::json($analysis);
    }
}
