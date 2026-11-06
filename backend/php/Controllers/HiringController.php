<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Auth.php';

class HiringController {
    public function getDossier(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $appId = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $stmt = $db->prepare("SELECT d.*, b.employee_code, b.start_date, b.status as binding_status FROM hiring_dossiers d LEFT JOIN employment_bindings b ON d.id = b.hiring_id WHERE d.application_id = ?");
        $stmt->execute([$appId]);
        $dossier = $stmt->fetch();

        if (!$dossier) {
            Response::json([
                'status' => 'pendiente',
                'checklist' => [
                    'davivienda_account' => false,
                    'eps_affiliation' => false,
                    'arl_affiliation' => false,
                    'pension_fund' => false,
                    'rut_certificate' => false
                ],
                'contract_type' => 'Cátedra Universitaria',
                'binding' => null
            ]);
            return;
        }

        Response::json([
            'id' => $dossier['id'],
            'status' => $dossier['status'],
            'checklist' => json_decode($dossier['checklist_json'] ?? '{}', true) ?: [],
            'contract_type' => $dossier['contract_type'] ?? 'Cátedra Universitaria',
            'formalization_date' => $dossier['formalization_date'],
            'binding' => !empty($dossier['employee_code']) ? [
                'employee_code' => $dossier['employee_code'],
                'start_date' => $dossier['start_date'],
                'status' => $dossier['binding_status']
            ] : null
        ]);
    }

    public function saveDossier(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $appId = $params['application_id'] ?? '';
        $checklist = $input['checklist'] ?? [];
        $contractStatus = $input['contract_status'] ?? 'en_tramite';
        $contractType = $input['contract_type'] ?? 'Cátedra Universitaria';
        $notes = $input['notes'] ?? '';

        $db = Database::getConnection();
        $st = $db->prepare("SELECT id FROM hiring_dossiers WHERE application_id = ?");
        $st->execute([$appId]);
        if ($row = $st->fetch()) {
            $upd = $db->prepare("UPDATE hiring_dossiers SET status = ?, checklist_json = ?, contract_type = ?, notes = ?, responsible_id = ? WHERE application_id = ?");
            $upd->execute([$contractStatus, json_encode($checklist, JSON_UNESCAPED_UNICODE), $contractType, $notes, $user['id'], $appId]);
        } else {
            $ins = $db->prepare("INSERT INTO hiring_dossiers (id, application_id, status, checklist_json, responsible_id, contract_type, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
            $ins->execute([Auth::uuid(), $appId, $contractStatus, json_encode($checklist, JSON_UNESCAPED_UNICODE), $user['id'], $contractType, $notes]);
        }

        $updApp = $db->prepare("UPDATE applications SET status = 'en_contratacion' WHERE id = ?");
        $updApp->execute([$appId]);

        Response::json(['message' => 'Expediente de contratación actualizado exitosamente.']);
    }

    public function confirmBinding(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $appId = $params['application_id'] ?? '';
        $employeeCode = trim($input['employee_code'] ?? '');
        $startDate = $input['start_date'] ?? date('Y-m-d');

        if (empty($employeeCode)) Response::error("El código de empleado institucional es obligatorio.", 422);

        $db = Database::getConnection();
        $dosStmt = $db->prepare("SELECT id FROM hiring_dossiers WHERE application_id = ?");
        $dosStmt->execute([$appId]);
        $dossier = $dosStmt->fetch();

        $hiringId = $dossier ? $dossier['id'] : Auth::uuid();
        if (!$dossier) {
            $insDos = $db->prepare("INSERT INTO hiring_dossiers (id, application_id, status, checklist_json, responsible_id, formalization_date, created_at) VALUES (?, ?, 'formalizado', '{}', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            $insDos->execute([$hiringId, $appId, $user['id']]);
        } else {
            $updDos = $db->prepare("UPDATE hiring_dossiers SET status = 'formalizado', formalization_date = CURRENT_TIMESTAMP WHERE id = ?");
            $updDos->execute([$hiringId]);
        }

        // Binding record
        $bindId = Auth::uuid();
        $st = $db->prepare("SELECT id FROM employment_bindings WHERE application_id = ?");
        $st->execute([$appId]);
        if ($bRow = $st->fetch()) {
            $updBind = $db->prepare("UPDATE employment_bindings SET employee_code = ?, start_date = ?, confirmed_by_id = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?");
            $updBind->execute([$employeeCode, $startDate, $user['id'], $bRow['id']]);
        } else {
            $insBind = $db->prepare("INSERT INTO employment_bindings (id, hiring_id, application_id, employee_code, start_date, status, confirmed_by_id, confirmed_at) VALUES (?, ?, ?, ?, ?, 'vinculado', ?, CURRENT_TIMESTAMP)");
            $insBind->execute([$bindId, $hiringId, $appId, $employeeCode, $startDate, $user['id']]);
        }

        $updApp = $db->prepare("UPDATE applications SET status = 'vinculada' WHERE id = ?");
        $updApp->execute([$appId]);

        Response::json([
            'message' => 'Vinculación formalizada exitosamente en el sistema institucional.',
            'employee_code' => $employeeCode
        ]);
    }

    public function transferInstitutional(array $input, array $params): void {
        $user = Auth::requireRole(['administrador', 'reclutador', 'talento_humano']);
        $appId = $params['application_id'] ?? '';
        $db = Database::getConnection();

        $id = Auth::uuid();
        $ins = $db->prepare("INSERT INTO institutional_integrations (id, application_id, destination_system, status, attempts, transferred_at) VALUES (?, ?, 'Dirección de Gestión del Talento Humano CECAR', 'transferido', 1, CURRENT_TIMESTAMP)");
        $ins->execute([$id, $appId]);

        Response::json(['message' => 'Expediente transferido formalmente a Talento Humano CECAR.', 'log_id' => $id]);
    }
}
