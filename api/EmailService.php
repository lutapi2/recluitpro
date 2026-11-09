<?php
declare(strict_types=1);

namespace RecruitPro;

use Exception;

require_once __DIR__ . '/Config.php';

class EmailService {
    public static function sendEmail(string $recipient, string $subject, string $textBody, string $htmlBody): bool {
        $host = getenv('SMTP_HOST') ?: '127.0.0.1';
        $port = (int)(getenv('SMTP_PORT') ?: 1025);
        $from = getenv('MAIL_FROM') ?: 'RecruitPro <no-reply@recruitpro.local>';
        $timeout = 5;

        try {
            // Attempt socket connection to SMTP
            $socket = @fsockopen($host, $port, $errno, $errstr, $timeout);
            if (!$socket) {
                // If SMTP is not reachable (e.g. local dev without MailHog), log and return false without failing
                error_log("RecruitPro Email (Notice: SMTP not connected at $host:$port): Para: $recipient | Asunto: $subject");
                return false;
            }

            $read = fgets($socket, 512);
            fputs($socket, "HELO recruitpro.local\r\n");
            $read = fgets($socket, 512);

            $cleanFrom = preg_replace('/.*<([^>]+)>.*/', '$1', $from);
            fputs($socket, "MAIL FROM: <$cleanFrom>\r\n");
            $read = fgets($socket, 512);

            fputs($socket, "RCPT TO: <$recipient>\r\n");
            $read = fgets($socket, 512);

            fputs($socket, "DATA\r\n");
            $read = fgets($socket, 512);

            $boundary = "RecruitPro_" . md5((string)time());
            $headers = "From: $from\r\n";
            $headers .= "To: $recipient\r\n";
            $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
            $headers .= "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

            $body = "--$boundary\r\n";
            $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
            $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
            $body .= $textBody . "\r\n\r\n";
            $body .= "--$boundary\r\n";
            $body .= "Content-Type: text/html; charset=UTF-8\r\n";
            $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
            $body .= $htmlBody . "\r\n\r\n";
            $body .= "--$boundary--\r\n";

            fputs($socket, $headers . "\r\n" . $body . "\r\n.\r\n");
            $read = fgets($socket, 512);

            fputs($socket, "QUIT\r\n");
            fclose($socket);
            return true;
        } catch (Exception $e) {
            error_log("RecruitPro Email error: " . $e->getMessage());
            return false;
        }
    }

    public static function sendAccountEmail(string $recipient, string $subject, string $heading, string $detail, string $link): bool {
        $textBody = "$heading\n\n$detail\n\n$link\n\nSi no solicitaste esta acción, ignora este correo.";
        $safeHeading = htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
        $safeDetail = htmlspecialchars($detail, ENT_QUOTES, 'UTF-8');
        $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');

        $htmlBody = "<h1>$safeHeading</h1><p>$safeDetail</p><p><a href=\"$safeLink\">Continuar en RecruitPro</a></p><p>Si no solicitaste esta acción, ignora este correo.</p>";
        return self::sendEmail($recipient, $subject, $textBody, $htmlBody);
    }

    public static function notifyUser(string $recipient, string $subject, string $message): bool {
        $safeMsg = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
        return self::sendEmail($recipient, $subject, $message, "<p>$safeMsg</p>");
    }
}
