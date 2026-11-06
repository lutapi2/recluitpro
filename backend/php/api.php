<?php

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Response.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Router.php';

// Controllers
require_once __DIR__ . '/Controllers/AuthController.php';
require_once __DIR__ . '/Controllers/VacancyController.php';
require_once __DIR__ . '/Controllers/ApplicationController.php';
require_once __DIR__ . '/Controllers/ItemController.php';
require_once __DIR__ . '/Controllers/SubsanacionController.php';
require_once __DIR__ . '/Controllers/InterviewController.php';
require_once __DIR__ . '/Controllers/TestController.php';
require_once __DIR__ . '/Controllers/OccupationalExamController.php';
require_once __DIR__ . '/Controllers/HiringController.php';
require_once __DIR__ . '/Controllers/HelpTicketController.php';
require_once __DIR__ . '/Controllers/ReportController.php';
require_once __DIR__ . '/Controllers/UserController.php';
require_once __DIR__ . '/Controllers/DocumentController.php';
require_once __DIR__ . '/Controllers/CatalogController.php';

$router = new Router();

// Auth Endpoints
$router->post('/api/auth/register', [AuthController::class, 'register']);
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->get('/api/auth/me', [AuthController::class, 'me']);
$router->post('/api/auth/logout', [AuthController::class, 'logout']);
$router->get('/api/auth/csrf', [AuthController::class, 'csrf']);
$router->post('/api/auth/password', [AuthController::class, 'changePassword']);
$router->post('/api/auth/profile', [AuthController::class, 'updateProfile']);
$router->delete('/api/auth/account', [AuthController::class, 'deleteAccount']);

// Vacancies Endpoints
$router->get('/api/public/vacancies', [VacancyController::class, 'publicList']);
$router->get('/api/vacancies/public', [VacancyController::class, 'publicList']);
$router->get('/api/vacancies', [VacancyController::class, 'index']);
$router->post('/api/vacancies', [VacancyController::class, 'create']);
$router->get('/api/vacancies/{vacancy_id}/applications', [ApplicationController::class, 'index']);
$router->get('/api/vacancies/{vacancy_id}', [VacancyController::class, 'show']);
$router->delete('/api/vacancies/{vacancy_id}', [VacancyController::class, 'delete']);

// Applications Endpoints
$router->get('/api/applications', [ApplicationController::class, 'index']);
$router->get('/api/applications/mine', [ApplicationController::class, 'mine']);
$router->get('/api/applications/my', [ApplicationController::class, 'mine']);
$router->get('/api/applications/review-board', [ApplicationController::class, 'index']);
$router->post('/api/applications/draft', [ApplicationController::class, 'draft']);
$router->get('/api/applications/{application_id}', [ApplicationController::class, 'show']);
$router->post('/api/applications/{application_id}/submit', [ApplicationController::class, 'submit']);
$router->post('/api/applications/{application_id}/preselect', [ApplicationController::class, 'preselect']);
$router->post('/api/applications/{application_id}/discard', [ApplicationController::class, 'discard']);
$router->post('/api/applications/{application_id}/retirar', [ApplicationController::class, 'retire']);
$router->post('/api/applications/{application_id}/internal-note', [ApplicationController::class, 'internalNote']);
$router->get('/api/applications/{application_id}/constancia', [ApplicationController::class, 'constancia']);
$router->post('/api/public/apply', [ApplicationController::class, 'publicApply']);

// Items & Supports (HV-001 al HV-026 y Regla RN-011)
$router->post('/api/applications/{application_id}/items', [ItemController::class, 'create']);
$router->put('/api/applications/{application_id}/items/{item_id}', [ItemController::class, 'update']);
$router->delete('/api/applications/{application_id}/items/{item_id}', [ItemController::class, 'delete']);
$router->post('/api/applications/{application_id}/items/{item_id}/review', [ItemController::class, 'review']);
$router->post('/api/applications/{application_id}/items/{item_id}/support', [ItemController::class, 'uploadSupport']);
$router->get('/api/items/{item_id}/supports/{support_id}/view', [ItemController::class, 'viewSupport']);
$router->get('/api/items/{item_id}/supports/{support_id}/download', [ItemController::class, 'viewSupport']);

// Subsanación
$router->post('/api/applications/{application_id}/subsanacion/request', [SubsanacionController::class, 'request']);
$router->post('/api/applications/{application_id}/subsanacion/submit', [SubsanacionController::class, 'submit']);

// Entrevistas
$router->get('/api/interviews/slots', [InterviewController::class, 'listSlots']);
$router->post('/api/interviews/slots', [InterviewController::class, 'createSlot']);
$router->post('/api/interviews/schedule', [InterviewController::class, 'schedule']);
$router->post('/api/interviews/{interview_id}/evaluate', [InterviewController::class, 'evaluate']);
$router->post('/api/interviews/{interview_id}/respond', [InterviewController::class, 'respond']);

// Pruebas
$router->post('/api/applications/{application_id}/tests', [TestController::class, 'recordTest']);
$router->post('/api/applications/{application_id}/classroom-test', [TestController::class, 'recordClassroomTest']);

// Salud Ocupacional (RN-027)
$router->post('/api/applications/{application_id}/occupational-exam', [OccupationalExamController::class, 'recordExam']);

// Expediente y Vinculación
$router->get('/api/applications/{application_id}/hiring-dossier', [HiringController::class, 'getDossier']);
$router->post('/api/applications/{application_id}/hiring-dossier', [HiringController::class, 'saveDossier']);
$router->post('/api/applications/{application_id}/confirm-binding', [HiringController::class, 'confirmBinding']);
$router->post('/api/applications/{application_id}/transfer-institutional-hv', [HiringController::class, 'transferInstitutional']);

// Mesa de Ayuda
$router->get('/api/tickets', [HelpTicketController::class, 'index']);
$router->post('/api/tickets', [HelpTicketController::class, 'create']);
$router->post('/api/tickets/{ticket_id}/reply', [HelpTicketController::class, 'reply']);

// Reportes y Dashboard
$router->get('/api/reports/specialized', [ReportController::class, 'specialized']);
$router->get('/api/reports/export', [ReportController::class, 'exportCsv']);
$router->get('/api/dashboard/summary', [ReportController::class, 'summary']);

// Usuarios
$router->get('/api/users', [UserController::class, 'index']);
$router->post('/api/users/{user_id}/promote-recruiter', [UserController::class, 'promote']);
$router->delete('/api/users/{user_id}', [UserController::class, 'delete']);

// Documentos
$router->post('/api/documents', [DocumentController::class, 'upload']);
$router->get('/api/documents/{document_id}', [DocumentController::class, 'show']);
$router->get('/api/documents/{document_id}/view', [DocumentController::class, 'view']);
$router->get('/api/documents/{document_id}/download', [DocumentController::class, 'download']);

// Catálogos
$router->get('/api/catalogos', [CatalogController::class, 'index']);

// Health
$router->get('/api/health', function() {
    Response::json(['status' => 'ok', 'runtime' => 'PHP ' . PHP_VERSION, 'driver' => Database::getDriver()]);
});

$router->dispatch();
