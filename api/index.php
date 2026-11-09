<?php
declare(strict_types=1);

namespace RecruitPro;

use Throwable;
use RecruitPro\Controllers\AuthController;
use RecruitPro\Controllers\VacanciesController;
use RecruitPro\Controllers\ApplicationsController;
use RecruitPro\Controllers\DocumentsController;
use RecruitPro\Controllers\UsersController;
use RecruitPro\Controllers\DashboardController;
use RecruitPro\Controllers\AiController;

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Response.php';
require_once __DIR__ . '/Security.php';
require_once __DIR__ . '/Serialization.php';
require_once __DIR__ . '/AiService.php';
require_once __DIR__ . '/EmailService.php';

require_once __DIR__ . '/Controllers/AuthController.php';
require_once __DIR__ . '/Controllers/VacanciesController.php';
require_once __DIR__ . '/Controllers/ApplicationsController.php';
require_once __DIR__ . '/Controllers/DocumentsController.php';
require_once __DIR__ . '/Controllers/UsersController.php';
require_once __DIR__ . '/Controllers/DashboardController.php';
require_once __DIR__ . '/Controllers/AiController.php';

// Global CORS & standard headers
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($origin)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, Authorization");
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    // Normalize path from PATH_INFO, query param or REQUEST_URI
    if (!empty($_SERVER['PATH_INFO'])) {
        $path = '/' . trim($_SERVER['PATH_INFO'], '/');
    } elseif (isset($_GET['path'])) {
        $path = '/' . trim($_GET['path'], '/');
    } else {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $path = preg_replace('#^/api(/index\.php)?#', '', $uri);
        $path = preg_replace('#^/index\.php#', '', $path);
        $path = '/' . trim($path, '/');
    }

    // Parse JSON body if present
    $rawBody = file_get_contents('php://input');
    $jsonBody = [];
    if (!empty($rawBody)) {
        $decoded = json_decode($rawBody, true);
        if (is_array($decoded)) {
            $jsonBody = $decoded;
        }
    }

    // Merge $_POST if present
    $body = !empty($jsonBody) ? $jsonBody : $_POST;

    // --- HEALTH ---
    if ($method === 'GET' && $path === '/health') {
        $pdo = Database::getConnection();
        $pdo->query("SELECT 1");
        Response::json(['status' => 'ok']);
    }

    // --- AUTH ---
    if ($method === 'GET' && $path === '/auth/csrf') {
        AuthController::csrf();
    }
    if ($method === 'POST' && $path === '/auth/register') {
        AuthController::register($body);
    }
    if ($method === 'POST' && $path === '/auth/login') {
        AuthController::login($body);
    }
    if ($method === 'GET' && $path === '/auth/me') {
        AuthController::me();
    }
    if ($method === 'POST' && $path === '/auth/verify-email') {
        AuthController::verifyEmail($body);
    }
    if ($method === 'POST' && $path === '/auth/verification/resend') {
        AuthController::resendVerification($body);
    }
    if ($method === 'POST' && $path === '/auth/password-reset') {
        AuthController::passwordReset($body);
    }
    if ($method === 'POST' && $path === '/auth/password-reset/confirm') {
        AuthController::passwordResetConfirm($body);
    }
    if ($method === 'PATCH' && $path === '/auth/profile') {
        AuthController::profile($body);
    }
    if ($method === 'POST' && $path === '/auth/password') {
        AuthController::changePassword($body);
    }
    if ($method === 'DELETE' && $path === '/auth/account') {
        AuthController::deleteAccount($body);
    }
    if ($method === 'POST' && $path === '/auth/logout') {
        AuthController::logout();
    }
    if ($method === 'GET' && $path === '/privacy') {
        AuthController::privacy();
    }

    // --- DASHBOARD ---
    if ($method === 'GET' && $path === '/dashboard/summary') {
        DashboardController::summary();
    }

    // --- USERS ---
    if ($method === 'GET' && $path === '/users') {
        UsersController::listUsers($_GET);
    }
    if ($method === 'PATCH' && preg_match('#^/users/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        UsersController::updateUser($m[1], $body);
    }
    if ($method === 'POST' && preg_match('#^/users/([a-zA-Z0-9_-]+)/promote-recruiter$#', $path, $m)) {
        UsersController::promoteRecruiter($m[1]);
    }
    if ($method === 'DELETE' && preg_match('#^/users/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        UsersController::deleteUser($m[1]);
    }

    // --- VACANCIES ---
    if ($method === 'GET' && $path === '/vacancies') {
        VacanciesController::listVacancies($_GET);
    }
    if ($method === 'POST' && $path === '/vacancies') {
        VacanciesController::createVacancy($body);
    }
    if ($method === 'PATCH' && preg_match('#^/vacancies/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        VacanciesController::updateVacancy($m[1], $body);
    }
    if ($method === 'DELETE' && preg_match('#^/vacancies/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        VacanciesController::deleteVacancy($m[1]);
    }
    if ($method === 'POST' && preg_match('#^/vacancies/([a-zA-Z0-9_-]+)/applications$#', $path, $m)) {
        ApplicationsController::applyToVacancy($m[1], $_POST, $_FILES);
    }

    // --- DOCUMENTS ---
    if ($method === 'POST' && $path === '/documents') {
        DocumentsController::uploadDocument($_FILES);
    }
    if ($method === 'GET' && preg_match('#^/documents/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        DocumentsController::downloadDocument($m[1]);
    }

    // --- APPLICATIONS & PROCESSES ---
    if ($method === 'GET' && $path === '/processes/stats') {
        ApplicationsController::getProcessStats();
    }
    if ($method === 'GET' && preg_match('#^/applications/([a-zA-Z0-9_-]+)/checklist$#', $path, $m)) {
        ApplicationsController::getChecklist($m[1]);
    }
    if ($method === 'PATCH' && preg_match('#^/applications/([a-zA-Z0-9_-]+)/checklist/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        ApplicationsController::updateChecklistItem($m[1], $m[2], $body);
    }
    if ($method === 'GET' && $path === '/help/tickets') {
        ApplicationsController::listHelpTickets();
    }
    if ($method === 'POST' && $path === '/help/tickets') {
        ApplicationsController::createHelpTicket($body);
    }
    if ($method === 'GET' && $path === '/applications') {
        ApplicationsController::listAllApplications($_GET);
    }
    if ($method === 'GET' && $path === '/applications/mine') {
        ApplicationsController::listMyApplications($_GET);
    }
    if ($method === 'PATCH' && preg_match('#^/applications/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        ApplicationsController::updateApplication($m[1], $body);
    }
    if ($method === 'DELETE' && preg_match('#^/applications/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        ApplicationsController::deleteApplication($m[1]);
    }

    // --- AI ---
    if ($method === 'GET' && preg_match('#^/ai/analyze-application/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        AiController::analyzeApplication($m[1]);
    }
    if ($method === 'GET' && preg_match('#^/ai/analyze-vacancy-fit/([a-zA-Z0-9_-]+)$#', $path, $m)) {
        AiController::analyzeVacancyFit($m[1]);
    }

    // --- PUBLIC CAREERS PORTAL ---
    if ($method === 'GET' && $path === '/public/vacancies') {
        VacanciesController::listPublicVacancies($_GET);
    }
    if ($method === 'POST' && $path === '/public/apply') {
        ApplicationsController::publicApply($_POST, $_FILES);
    }

    // Not Found
    Response::error("Ruta API no encontrada: $method $uri", 404);

} catch (Throwable $t) {
    error_log("RecruitPro API Unhandled Exception: " . $t->getMessage() . "\n" . $t->getTraceAsString());
    Response::error("Error interno del servidor: " . $t->getMessage(), 500);
}
