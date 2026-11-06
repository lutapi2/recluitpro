<?php

$baseDir = __DIR__;
if (!file_exists($baseDir . '/backend/php/api.php') && file_exists($baseDir . '/recluitpro-main/backend/php/api.php')) {
    $baseDir = $baseDir . '/recluitpro-main';
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

// Health check for Render (HEAD / or GET / or any HEAD probe)
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
    http_response_code(200);
    exit;
}

if ($uri === '/' || $uri === '/index.html') {
    if (file_exists($baseDir . '/index.html')) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($baseDir . '/index.html');
        exit;
    }
}

// Route API requests to PHP API handler
if (str_starts_with($uri, '/api/')) {
    require_once $baseDir . '/backend/php/api.php';
    exit;
}

// Clean extensionless URLs (e.g. /empleos -> /empleos.html, /dashboard -> /dashboard.html)
$htmlCandidate = $baseDir . '/' . trim($uri, '/') . '.html';
if (file_exists($htmlCandidate)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($htmlCandidate);
    exit;
}

// If static file exists, let PHP serve it directly
$filePath = $baseDir . $uri;
if ($uri !== '/' && file_exists($filePath) && !is_dir($filePath)) {
    return false;
}

// Default fallback to index.html
if (file_exists($baseDir . '/index.html')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($baseDir . '/index.html');
    exit;
}

http_response_code(404);
echo "404 Not Found";
