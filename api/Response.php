<?php
declare(strict_types=1);

namespace RecruitPro;

class Response {
    public static function json(mixed $data, int $statusCode = 200, array $headers = []): void {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        foreach ($headers as $key => $val) {
            header("$key: $val");
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $statusCode = 400): void {
        self::json(['detail' => $message], $statusCode);
    }

    public static function noContent(): void {
        http_response_code(204);
        exit;
    }

    public static function file(string $path, string $mediaType, string $filename, ?string $fileData = null): void {
        $content = null;
        if (is_file($path) && filesize($path) > 0) {
            $content = file_get_contents($path);
        } elseif ($fileData !== null && strlen($fileData) > 0) {
            $content = $fileData;
            @file_put_contents($path, $fileData);
        }

        if ($content === null) {
            self::error("No se encontró el archivo físico.", 404);
        }

        http_response_code(200);
        header('Content-Type: ' . ($mediaType ?: 'application/pdf'));
        header('Content-Disposition: inline; filename="' . rawurlencode($filename) . '"');
        header('X-Document-Name: ' . rawurlencode($filename));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header('Content-Length: ' . strlen($content));

        echo $content;
        exit;
    }

    public static function streamPdf(string $bytes, string $filename): void {
        http_response_code(200);
        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . rawurlencode($filename) . '"');
        header('X-Document-Name: ' . rawurlencode($filename));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header('Content-Length: ' . strlen($bytes));

        echo $bytes;
        exit;
    }
}
