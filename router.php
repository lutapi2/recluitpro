<?php
declare(strict_types=1);

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

// 1. API routes
if (str_starts_with($uri, '/api')) {
    require __DIR__ . '/api/index.php';
    return;
}

// 2. Direct static file check
$targetFile = __DIR__ . $uri;
if ($uri !== '/' && is_file($targetFile)) {
    return false; // Let PHP built-in webserver serve the file directly
}

// 3. Clean URLs routing
$cleanRoutes = [
    '/' => '/index.html',
    '/index' => '/index.html',
    '/empleos' => '/empleos.html',
    '/dashboard' => '/dashboard.html',
    '/registro' => '/registro.html',
    '/verificar' => '/verificar.html',
    '/restablecer' => '/restablecer.html',
    '/recuperar' => '/recuperar.html',
    '/privacidad' => '/privacidad.html',
];

if (isset($cleanRoutes[$uri])) {
    $targetHtml = __DIR__ . $cleanRoutes[$uri];
    if (is_file($targetHtml)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($targetHtml);
        return;
    }
}

// Fallback for everything else
return false;
