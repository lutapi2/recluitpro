<?php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';

class CatalogController {
    public function index(): void {
        $db = Database::getConnection();
        $reasons = $db->query("SELECT id, code, name, description FROM discard_reasons WHERE active = 1")->fetchAll();

        Response::json([
            'discard_reasons' => $reasons,
            'faculties' => [
                'Facultad de Educación y Ciencias Sociales',
                'Facultad de Ingeniería',
                'Facultad de Ciencias Económicas y Administrativas',
                'Facultad de Derecho y Ciencias Políticas',
                'Dirección de Extensión y Educación Continuada',
                'Gestión del Talento Humano'
            ],
            'campuses' => [
                'Sede Principal Sincelejo',
                'Campus Sincelejo',
                'Centro Tutorial Montería',
                'Centro Tutorial Magangué',
                'Centro Tutorial Lorica',
                'Virtual / Remoto'
            ],
            'academic_periods' => ['2026-1', '2026-2', '2027-1'],
            'item_types' => [
                ['code' => 'HV-001', 'name' => 'Foto de identificación reciente', 'section' => 'identificacion'],
                ['code' => 'HV-002', 'name' => 'Documento de identidad (Cédula/Pasaporte)', 'section' => 'identificacion'],
                ['code' => 'HV-003', 'name' => 'Libreta militar (si aplica)', 'section' => 'identificacion'],
                ['code' => 'HV-004', 'name' => 'Hoja de vida en formato estándar CECAR', 'section' => 'identificacion'],
                ['code' => 'HV-005', 'name' => 'Título de bachiller académico', 'section' => 'formacion'],
                ['code' => 'HV-006', 'name' => 'Título profesional de pregrado', 'section' => 'formacion'],
                ['code' => 'HV-007', 'name' => 'Acta de grado de pregrado', 'section' => 'formacion'],
                ['code' => 'HV-008', 'name' => 'Tarjeta profesional o matrícula vigente', 'section' => 'formacion'],
                ['code' => 'HV-009', 'name' => 'Certificado de vigencia de tarjeta profesional', 'section' => 'formacion'],
                ['code' => 'HV-010', 'name' => 'Resolución de convalidación MinEducación', 'section' => 'formacion'],
                ['code' => 'HV-011', 'name' => 'Título y acta de especialización', 'section' => 'formacion'],
                ['code' => 'HV-012', 'name' => 'Título y acta de maestría', 'section' => 'formacion'],
                ['code' => 'HV-013', 'name' => 'Título y acta de doctorado (PhD)', 'section' => 'formacion'],
                ['code' => 'HV-014', 'name' => 'Certificados de diplomados o cursos', 'section' => 'formacion'],
                ['code' => 'HV-015', 'name' => 'Certificación de competencia en segunda lengua', 'section' => 'formacion'],
                ['code' => 'HV-016', 'name' => 'Certificaciones de experiencia docente universitaria', 'section' => 'experiencia'],
                ['code' => 'HV-017', 'name' => 'Certificaciones de experiencia laboral profesional', 'section' => 'experiencia'],
                ['code' => 'HV-018', 'name' => 'Certificaciones de escalafón docente previo', 'section' => 'experiencia'],
                ['code' => 'HV-019', 'name' => 'Publicaciones de artículos científicos o indexados', 'section' => 'produccion'],
                ['code' => 'HV-020', 'name' => 'Libros o capítulos de libro con ISBN', 'section' => 'produccion'],
                ['code' => 'HV-021', 'name' => 'Certificado de categorización MinCiencias', 'section' => 'produccion'],
                ['code' => 'HV-022', 'name' => 'Patentes, registros de software o modelos', 'section' => 'produccion'],
                ['code' => 'HV-023', 'name' => 'Certificado de antecedentes de Policía Nacional', 'section' => 'requisitos_legales'],
                ['code' => 'HV-024', 'name' => 'Certificado de antecedentes Procuraduría General', 'section' => 'requisitos_legales'],
                ['code' => 'HV-025', 'name' => 'Certificado de antecedentes Contraloría General', 'section' => 'requisitos_legales'],
                ['code' => 'HV-026', 'name' => 'Registro Nacional de Medidas Correctivas (RNMC)', 'section' => 'requisitos_legales']
            ]
        ]);
    }
}
