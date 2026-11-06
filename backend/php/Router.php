<?php

require_once __DIR__ . '/Response.php';

class Router {
    private array $routes = [];

    public function add(string $method, string $path, callable|array $handler): void {
        $this->routes[] = [
            'method' => strtoupper($method),
            'path' => '/' . trim($path, '/'),
            'handler' => $handler
        ];
    }

    public function get(string $path, callable|array $handler): void { $this->add('GET', $path, $handler); }
    public function post(string $path, callable|array $handler): void { $this->add('POST', $path, $handler); }
    public function put(string $path, callable|array $handler): void { $this->add('PUT', $path, $handler); }
    public function patch(string $path, callable|array $handler): void { $this->add('PATCH', $path, $handler); }
    public function delete(string $path, callable|array $handler): void { $this->add('DELETE', $path, $handler); }

    public function dispatch(): void {
        // Handle CORS
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
        header("Access-Control-Allow-Origin: {$origin}");
        header("Access-Control-Allow-Credentials: true");
        header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
        header("Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, Accept, X-CSRF-Token");

        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'OPTIONS') {
            http_response_code(200);
            exit;
        }

        // Render health check HEAD /
        if ($method === 'HEAD') {
            http_response_code(200);
            exit;
        }

        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $uri = '/' . trim($uri, '/');

        // Parse input
        $input = [];
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_contains($contentType, 'application/json')) {
            $raw = file_get_contents('php://input');
            $input = json_decode($raw, true) ?: [];
        } else {
            $input = $_POST;
        }

        if (empty($input)) {
            $raw = file_get_contents('php://input');
            if (!empty($raw)) {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    $input = $decoded;
                }
            }
        }

        if (is_string($input)) {
            $secondDecoded = json_decode($input, true);
            if (is_array($secondDecoded)) {
                $input = $secondDecoded;
            } else {
                $input = [];
            }
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) continue;

            $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[^/]+)', $route['path']);
            $pattern = '#^' . $pattern . '$#';

            if (preg_match($pattern, $uri, $matches)) {
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                
                try {
                    $handler = $route['handler'];
                    if (is_array($handler)) {
                        [$class, $fn] = $handler;
                        $instance = new $class();
                        $instance->$fn($input, $params);
                    } else {
                        $handler($input, $params);
                    }
                    return;
                } catch (Exception $e) {
                    Response::error($e->getMessage(), 500);
                    return;
                }
            }
        }

        Response::error("Ruta no encontrada: [{$method}] {$uri}", 404);
    }
}
