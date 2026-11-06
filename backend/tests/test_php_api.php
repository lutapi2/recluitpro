<?php

$baseUrl = 'http://127.0.0.1:8099';

function req(string $method, string $path, array $data = [], ?string $token = null): array {
    global $baseUrl;
    $url = $baseUrl . $path;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

    $headers = ['Accept: application/json'];
    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    if (!empty($data)) {
        $json = json_encode($data);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        $headers[] = 'Content-Type: application/json';
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $status, 'raw' => $response, 'data' => json_decode($response, true) ?: $response];
}

echo "=== INICIANDO SUITE COMPLETA DE PRUEBAS PHP ===\n";

// 1. Health
$r = req('GET', '/api/health');
echo "1. Health check: Status {$r['status']} -> " . json_encode($r['data']) . "\n";
assert($r['status'] === 200);

// 2. Public Vacancies
$r = req('GET', '/api/public/vacancies');
echo "2. Convocatorias públicas: Status {$r['status']} (" . count($r['data']['items'] ?? []) . " vacantes)\n";
assert($r['status'] === 200);
assert(!empty($r['data']['items']));

// 3. Login Admin CECAR
$r = req('POST', '/api/auth/login', [
    'email' => 'admin@recruitpro.internal',
    'password' => 'admin-password-1234'
]);
echo "3. Login Administrador CECAR: Status {$r['status']} -> Rol: " . ($r['data']['user']['role'] ?? '') . "\n";
assert($r['status'] === 200);
$token = $r['data']['token'] ?? null;
assert(!empty($token));

// 4. Me endpoint
$r = req('GET', '/api/auth/me', [], $token);
echo "4. Perfil /api/auth/me: Status {$r['status']} -> " . ($r['data']['name'] ?? '') . "\n";
assert($r['status'] === 200);

// 5. Catálogos CECAR (RN-024)
$r = req('GET', '/api/catalogos', [], $token);
$reasonsCount = count($r['data']['discard_reasons'] ?? []);
echo "5. Catálogo de causales y documentos: Status {$r['status']} ({$reasonsCount} causales normativas)\n";
assert($r['status'] === 200);

// 6. Summary del Dashboard
$r = req('GET', '/api/dashboard/summary', [], $token);
echo "6. Resumen de Dashboard: Status {$r['status']} -> " . json_encode($r['data']) . "\n";
assert($r['status'] === 200);

// 7. Reporte Especializado No Aprobados
$r = req('GET', '/api/reports/specialized?report_type=no_aprobados', [], $token);
echo "7. Reporte No Aprobados: Status {$r['status']} (" . count($r['data']['records'] ?? []) . " registros)\n";
assert($r['status'] === 200);

// 8. Registro de nuevo candidato
$candidateEmail = 'aspirante_' . time() . '@cecar.edu.co';
$r = req('POST', '/api/auth/register', [
    'name' => 'Dr. Aspirante CECAR',
    'email' => $candidateEmail,
    'password' => 'Password123!',
    'privacy_consent' => true
]);
echo "8. Registro de Aspirante: Status {$r['status']} -> " . ($r['data']['user']['email'] ?? '') . "\n";
assert($r['status'] === 201);
$candidateToken = $r['data']['token'];

// 9. Crear postulación en borrador
$vacId = 'e928ec9d-4615-4dd3-ba17-81438fb5b0fd';
$r = req('POST', '/api/applications/draft', [
    'vacancy_id' => $vacId,
    'privacy_consent' => true
], $candidateToken);
echo "9. Borrador de Postulación: Status {$r['status']} -> RAW: " . $r['raw'] . "\n";
assert($r['status'] === 200 || $r['status'] === 201);
$appId = $r['data']['id'];

// 10. Agregar ítem de Hoja de Vida (HV-006: Título de pregrado)
$r = req('POST', "/api/applications/{$appId}/items", [
    'item_type' => 'HV-006',
    'section' => 'formacion',
    'title' => 'Ingeniero de Sistemas y Computación',
    'data' => ['institucion' => 'CECAR', 'anio' => 2020]
], $candidateToken);
echo "10. Creación de Ítem HV-006: Status {$r['status']} -> ID: " . ($r['data']['id'] ?? '') . "\n";
assert($r['status'] === 201);
$itemId = $r['data']['id'];

// 11. Revisión de ítem por Reclutador (Marcar observado)
$r = req('POST', "/api/applications/{$appId}/items/{$itemId}/review", [
    'result' => 'observado',
    'reason' => 'Falta acta de grado legible',
    'observation' => 'Por favor adjuntar acta de grado nítida con sello institucional'
], $token);
echo "11. Mesa de Verificación (Marcar Observado): Status {$r['status']}\n";
assert($r['status'] === 200);

// 12. Solicitud de Subsanación formal
$r = req('POST', "/api/applications/{$appId}/subsanacion/request", [
    'days' => 5,
    'general_note' => 'Subsanar soporte de grado'
], $token);
echo "12. Solicitud Subsanación formal: Status {$r['status']}\n";
assert($r['status'] === 200);

// 13. Verificación de Regla RN-011: Aspirante actualiza ítem observado
$r = req('PUT', "/api/applications/{$appId}/items/{$itemId}", [
    'title' => 'Ingeniero de Sistemas y Computación (Subsanado)'
], $candidateToken);
echo "13. Aspirante corrige ítem observado: Status {$r['status']}\n";
assert($r['status'] === 200);

// 14. Radicación de Subsanación
$r = req('POST', "/api/applications/{$appId}/subsanacion/submit", [], $candidateToken);
echo "14. Radicación de Subsanación: Status {$r['status']}\n";
assert($r['status'] === 200);

echo "\n======================================================\n";
echo "¡TODOS LOS 14 TESTS DE LA API EN PHP PASARON CON 100%!\n";
echo "======================================================\n";
