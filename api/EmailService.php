<?php
declare(strict_types=1);

namespace RecruitPro;

use Exception;

require_once __DIR__ . '/Config.php';

class EmailService {
    public static function sendEmail(string $recipient, string $subject, string $textBody, string $htmlBody): bool {
        $host = getenv('SMTP_HOST') ?: '127.0.0.1';
        $port = (int)(getenv('SMTP_PORT') ?: 1025);
        $user = getenv('SMTP_USER') ?: '';
        $pass = getenv('SMTP_PASS') ?: '';
        $encryption = strtolower(getenv('SMTP_ENCRYPTION') ?: '');
        $from = getenv('MAIL_FROM') ?: 'CECAR Selección <no-reply@cecar.edu.co>';
        $timeout = 5;

        try {
            $socketHost = ($encryption === 'ssl' || $port === 465) ? "ssl://{$host}" : $host;
            $socket = @fsockopen($socketHost, $port, $errno, $errstr, $timeout);
            if (!$socket) {
                // If SMTP is not reachable (e.g. local dev without MailHog), log and return false without failing
                error_log("CECAR Email (Notice: SMTP not connected at $host:$port): Para: $recipient | Asunto: $subject");
                return false;
            }

            stream_set_timeout($socket, $timeout);
            $read = fgets($socket, 512);

            fputs($socket, "EHLO cecar.edu.co\r\n");
            $read = fgets($socket, 512);

            // STARTTLS if required or on standard submission port 587
            if ($encryption === 'tls' || ($port === 587 && str_contains((string)$read, 'STARTTLS'))) {
                fputs($socket, "STARTTLS\r\n");
                $read = fgets($socket, 512);
                if (str_starts_with((string)$read, '220')) {
                    stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                    fputs($socket, "EHLO cecar.edu.co\r\n");
                    $read = fgets($socket, 512);
                }
            }

            // SMTP Authentication if credentials are provided
            if (!empty($user) && !empty($pass)) {
                fputs($socket, "AUTH LOGIN\r\n");
                $read = fgets($socket, 512);
                fputs($socket, base64_encode($user) . "\r\n");
                $read = fgets($socket, 512);
                fputs($socket, base64_encode($pass) . "\r\n");
                $read = fgets($socket, 512);
            }

            $cleanFrom = preg_replace('/.*<([^>]+)>.*/', '$1', $from) ?: 'no-reply@cecar.edu.co';
            fputs($socket, "MAIL FROM: <$cleanFrom>\r\n");
            $read = fgets($socket, 512);

            fputs($socket, "RCPT TO: <$recipient>\r\n");
            $read = fgets($socket, 512);

            fputs($socket, "DATA\r\n");
            $read = fgets($socket, 512);

            $boundary = "CECAR_" . md5((string)time() . $recipient);
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
            error_log("CECAR Email error: " . $e->getMessage());
            return false;
        }
    }

    public static function sendAccountEmail(string $recipient, string $subject, string $heading, string $detail, string $link): bool {
        $textBody = "$heading\n\n$detail\n\n$link\n\nSi no solicitaste esta acción, ignora este correo.\nCorporación Universitaria del Caribe · CECAR";
        $safeHeading = htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
        $safeDetail = htmlspecialchars($detail, ENT_QUOTES, 'UTF-8');
        $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');

        $htmlBody = "
            <div style=\"font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: #07120c; color: #f8fafc; padding: 32px 20px;\">
                <div style=\"max-width: 560px; margin: 0 auto; background: #0d2117; border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 16px; padding: 30px;\">
                    <div style=\"color: #10b981; font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; margin-bottom: 8px;\">Corporación Universitaria del Caribe · CECAR</div>
                    <h2 style=\"color: #ffffff; margin: 0 0 14px 0;\">$safeHeading</h2>
                    <p style=\"color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 22px 0;\">$safeDetail</p>
                    <a href=\"$safeLink\" style=\"display: inline-block; background: #10b981; color: #ffffff; padding: 10px 22px; border-radius: 8px; font-weight: 700; text-decoration: none;\">Continuar en la Plataforma</a>
                    <hr style=\"border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 26px 0;\">
                    <small style=\"color: #64748b; font-size: 11.5px;\">Si no solicitaste esta acción en CECAR Selección, puedes ignorar este mensaje con seguridad.</small>
                </div>
            </div>
        ";
        return self::sendEmail($recipient, $subject, $textBody, $htmlBody);
    }

    public static function notifyUser(string $recipient, string $subject, string $message): bool {
        $safeMsg = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
        $textBody = "$subject\n\n$message\n\nCorporación Universitaria del Caribe · CECAR";
        $htmlBody = "
            <div style=\"font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: #07120c; color: #f8fafc; padding: 32px 20px;\">
                <div style=\"max-width: 560px; margin: 0 auto; background: #0d2117; border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 16px; padding: 30px;\">
                    <div style=\"color: #10b981; font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; margin-bottom: 8px;\">Notificación Institucional CECAR</div>
                    <h3 style=\"color: #ffffff; margin: 0 0 12px 0;\">" . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . "</h3>
                    <p style=\"color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;\">$safeMsg</p>
                </div>
            </div>
        ";
        return self::sendEmail($recipient, $subject, $textBody, $htmlBody);
    }
}
