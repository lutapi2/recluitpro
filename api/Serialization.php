<?php
declare(strict_types=1);

namespace RecruitPro;

use PDO;

require_once __DIR__ . '/Config.php';

class Serialization {
    public static function userData(array $user, PDO $pdo, array $viewer): array {
        $viewerRole = Config::normalizeRoleForClient($viewer['role'] ?? '');
        $userRole = Config::normalizeRoleForClient($user['role'] ?? '');

        if (($user['email'] ?? '') === 'luctapi89@gmail.com' || ($user['email'] ?? '') === 'admin@cecar.edu.co') {
            $userRole = 'administrador';
        }
        if (($viewer['email'] ?? '') === 'luctapi89@gmail.com' || ($viewer['email'] ?? '') === 'admin@cecar.edu.co') {
            $viewerRole = 'administrador';
        }
        $canViewDocs = ($viewerRole === 'administrador' || ($viewer['id'] ?? '') === $user['id']);

        if (!$canViewDocs && $viewerRole === 'reclutador') {
            $stmt = $pdo->prepare("
                SELECT a.id 
                FROM applications a
                JOIN vacancies v ON a.vacancy_id = v.id
                WHERE a.candidate_id = :candidate_id
                AND (v.recruiter_id = :viewer_id OR a.assigned_recruiter_id = :viewer_id2)
                LIMIT 1
            ");
            $stmt->execute([
                ':candidate_id' => $user['id'],
                ':viewer_id' => $viewer['id'],
                ':viewer_id2' => $viewer['id'],
            ]);
            $canViewDocs = (bool)$stmt->fetch();
        }

        $documents = [];
        if ($canViewDocs) {
            $docStmt = $pdo->prepare("SELECT id, original_name, media_type, size FROM documents WHERE owner_id = :owner_id");
            $docStmt->execute([':owner_id' => $user['id']]);
            $rows = $docStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $r) {
                $documents[] = [
                    'id' => $r['id'],
                    'name' => $r['original_name'],
                    'type' => $r['media_type'],
                    'size' => (int)$r['size'],
                ];
            }
        }

        return [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $userRole,
            'phone' => $user['phone'] ?? null,
            'location' => $user['location'] ?? null,
            'emailVerified' => !empty($user['email_verified_at']),
            'privacyConsentAt' => Config::toIso8601($user['privacy_consent_at'] ?? null),
            'privacyConsentVersion' => $user['privacy_consent_version'] ?? null,
            'documents' => $documents,
        ];
    }

    public static function vacancyData(array $vacancy, PDO $pdo, array $viewer, bool $includeDetails = true): array {
        $viewerRole = Config::normalizeRoleForClient($viewer['role'] ?? '');
        $canManage = ($viewerRole === 'administrador' || ($viewerRole === 'reclutador' && ($vacancy['recruiter_id'] ?? '') === ($viewer['id'] ?? '')));

        // Fetch recruiter info
        $recruiterName = "Administrador";
        $recruiterEmail = "";
        if (!empty($vacancy['recruiter_id'])) {
            $recStmt = $pdo->prepare("SELECT name, email FROM users WHERE id = :id LIMIT 1");
            $recStmt->execute([':id' => $vacancy['recruiter_id']]);
            $rec = $recStmt->fetch(PDO::FETCH_ASSOC);
            if ($rec) {
                $recruiterName = $rec['name'];
                $recruiterEmail = $rec['email'];
            }
        }

        $applications = [];
        if ($includeDetails) {
            $appSql = "
                SELECT a.*, 
                       c.email as candidate_email,
                       d.original_name as resume_name,
                       u.name as assigned_recruiter_name
                FROM applications a
                LEFT JOIN users c ON a.candidate_id = c.id
                LEFT JOIN documents d ON a.resume_id = d.id
                LEFT JOIN users u ON a.assigned_recruiter_id = u.id
                WHERE a.vacancy_id = :vacancy_id
            ";
            if ($viewerRole === 'reclutador' && !$canManage) {
                $appSql .= " AND a.assigned_recruiter_id = " . $pdo->quote($viewer['id']);
            } elseif ($viewerRole === 'candidato') {
                $appSql .= " AND a.candidate_id = " . $pdo->quote($viewer['id']);
            }

            if ($viewerRole === 'administrador' || $viewerRole === 'reclutador') {
                $stmt = $pdo->prepare($appSql . " ORDER BY a.created_at DESC");
                $stmt->execute([':vacancy_id' => $vacancy['id']]);
                $appRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($appRows as $item) {
                    // Fetch activities
                    $actStmt = $pdo->prepare("
                        SELECT act.*, u.name as author_name
                        FROM application_activities act
                        LEFT JOIN users u ON act.author_id = u.id
                        WHERE act.application_id = :app_id
                        ORDER BY act.created_at ASC
                    ");
                    $actStmt->execute([':app_id' => $item['id']]);
                    $activities = [];
                    foreach ($actStmt->fetchAll(PDO::FETCH_ASSOC) as $act) {
                        $activities[] = [
                            'type' => $act['event_type'],
                            'fromStatus' => $act['from_status'],
                            'toStatus' => $act['to_status'],
                            'note' => $act['note'],
                            'author' => $act['author_name'] ?: 'Sistema',
                            'createdAt' => Config::toIso8601($act['created_at']),
                        ];
                    }

                    $applications[] = [
                        'id' => $item['id'],
                        'email' => $item['candidate_email'] ?? '',
                        'name' => $item['name'],
                        'phone' => $item['phone'],
                        'location' => $item['location'],
                        'resumeId' => $item['resume_id'],
                        'resumeName' => $item['resume_name'] ?? 'cv.pdf',
                        'aiScore' => $item['ai_score'] !== null ? (int)$item['ai_score'] : null,
                        'aiVerdict' => $item['ai_verdict'],
                        'aiSummary' => $item['ai_summary'],
                        'appliedAt' => Config::toIso8601($item['created_at']),
                        'status' => $item['status'],
                        'assignedRecruiterId' => $item['assigned_recruiter_id'],
                        'assignedRecruiterName' => $item['assigned_recruiter_name'] ?? '',
                        'activities' => $activities,
                    ];
                }
            } elseif ($viewerRole === 'candidato') {
                $stmt = $pdo->prepare($appSql);
                $stmt->execute([':vacancy_id' => $vacancy['id']]);
                foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $item) {
                    $applications[] = [
                        'email' => $viewer['email'],
                        'status' => $item['status'],
                        'appliedAt' => Config::toIso8601($item['created_at']),
                    ];
                }
            }
        }

        return [
            'id' => $vacancy['id'],
            'title' => $vacancy['title'],
            'type' => $vacancy['type'],
            'location' => $vacancy['location'],
            'description' => $vacancy['description'],
            'status' => $vacancy['status'],
            'recruiterId' => $vacancy['recruiter_id'] ?: '',
            'recruiterEmail' => $recruiterEmail,
            'recruiterName' => $recruiterName,
            'canManage' => $canManage,
            'createdAt' => Config::toIso8601($vacancy['created_at']),
            'applications' => $applications,
        ];
    }
}
