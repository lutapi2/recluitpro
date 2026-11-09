<?php
declare(strict_types=1);

namespace RecruitPro;

use PDO;
use Exception;

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Database.php';

class RetentionService {
    public static function purgeInactiveCandidates(): int {
        $pdo = Database::getConnection();
        $retentionMonths = Config::RETENTION_MONTHS;
        $cutoffDays = (int)round(365.2425 * $retentionMonths / 12);
        $cutoff = date('Y-m-d H:i:s', time() - ($cutoffDays * 86400));

        $stmt = $pdo->prepare("
            SELECT id FROM users 
            WHERE (role = 'CANDIDATE' OR role = 'candidato') 
            AND last_activity_at < :cutoff
        ");
        $stmt->execute([':cutoff' => $cutoff]);
        $candidateIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($candidateIds)) {
            return 0;
        }

        $uploadDir = Config::getUploadDir();
        $filesToDelete = [];

        foreach ($candidateIds as $cid) {
            // Find all documents for candidate
            $docStmt = $pdo->prepare("SELECT storage_name FROM documents WHERE owner_id = :cid");
            $docStmt->execute([':cid' => $cid]);
            $snames = $docStmt->fetchAll(PDO::FETCH_COLUMN);
            foreach ($snames as $sname) {
                $filesToDelete[] = $uploadDir . DIRECTORY_SEPARATOR . $sname;
            }

            // Delete applications activities
            $appStmt = $pdo->prepare("SELECT id FROM applications WHERE candidate_id = :cid");
            $appStmt->execute([':cid' => $cid]);
            $appIds = $appStmt->fetchAll(PDO::FETCH_COLUMN);
            foreach ($appIds as $aid) {
                $pdo->prepare("DELETE FROM application_activities WHERE application_id = :aid")->execute([':aid' => $aid]);
                $pdo->prepare("DELETE FROM applications WHERE id = :aid")->execute([':aid' => $aid]);
            }

            // Delete documents & user
            $pdo->prepare("DELETE FROM documents WHERE owner_id = :cid")->execute([':cid' => $cid]);
            $pdo->prepare("DELETE FROM auth_sessions WHERE user_id = :cid")->execute([':cid' => $cid]);
            $pdo->prepare("DELETE FROM email_tokens WHERE user_id = :cid")->execute([':cid' => $cid]);
            $pdo->prepare("DELETE FROM users WHERE id = :cid")->execute([':cid' => $cid]);
        }

        foreach ($filesToDelete as $fpath) {
            if (is_file($fpath)) {
                @unlink($fpath);
            }
        }

        return count($candidateIds);
    }
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $count = RetentionService::purgeInactiveCandidates();
    echo "Se eliminaron $count cuentas de candidato inactivas.\n";
}
