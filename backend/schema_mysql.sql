-- ==============================================================================
-- RecruitPro ATS | Sistema de Selección CECAR v3.0
-- Base de Datos MySQL / MariaDB (Compatible con Render MySQL & XAMPP)
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS recruitpro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE recruitpro;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Usuarios
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'candidato',
    phone VARCHAR(30) NULL,
    location VARCHAR(100) NULL,
    faculty VARCHAR(150) NULL DEFAULT 'Facultad de Educación y Ciencias Sociales',
    campus VARCHAR(100) NULL DEFAULT 'Sede Principal Sincelejo',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    email_verified_at DATETIME NULL,
    privacy_consent_at DATETIME NULL,
    privacy_consent_version VARCHAR(30) NULL,
    INDEX idx_users_email (email),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Sesiones de Autenticación
CREATE TABLE IF NOT EXISTS auth_sessions (
    id VARCHAR(36) PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id VARCHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auth_user (user_id),
    INDEX idx_auth_token (token_hash),
    CONSTRAINT fk_auth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tokens de Correo (Recuperación y Verificación)
CREATE TABLE IF NOT EXISTS email_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    purpose VARCHAR(30) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_token_user (user_id),
    CONSTRAINT fk_email_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Documentos del Sistema
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(36) PRIMARY KEY,
    owner_id VARCHAR(36) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    media_type VARCHAR(100) NOT NULL,
    storage_name VARCHAR(64) NOT NULL UNIQUE,
    size INT NOT NULL,
    file_data LONGBLOB NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_doc_owner (owner_id),
    CONSTRAINT fk_doc_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Convocatorias / Vacantes CECAR
CREATE TABLE IF NOT EXISTS vacancies (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50) NULL,
    title VARCHAR(150) NOT NULL,
    type VARCHAR(60) NOT NULL,
    location VARCHAR(100) NOT NULL DEFAULT '',
    faculty VARCHAR(150) NULL DEFAULT 'Facultad de Educación y Ciencias Sociales',
    program VARCHAR(150) NULL DEFAULT 'Licenciatura en Educación Infantil',
    campus VARCHAR(100) NULL DEFAULT 'Sede Principal Sincelejo',
    academic_period VARCHAR(30) NULL DEFAULT '2026-2',
    vacancies_count INT NOT NULL DEFAULT 1,
    modality VARCHAR(50) NULL DEFAULT 'Presencial',
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    opening_date DATETIME NULL,
    closing_date DATETIME NULL,
    profile_json TEXT NULL,
    requirements_config_json TEXT NULL,
    criteria_config_json TEXT NULL,
    stages_config_json TEXT NULL,
    recruiter_id VARCHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vac_code (code),
    INDEX idx_vac_status (status),
    INDEX idx_vac_faculty (faculty),
    CONSTRAINT fk_vac_recruiter FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Postulaciones
CREATE TABLE IF NOT EXISTS applications (
    id VARCHAR(36) PRIMARY KEY,
    vacancy_id VARCHAR(36) NOT NULL,
    candidate_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL DEFAULT '',
    location VARCHAR(100) NOT NULL DEFAULT '',
    resume_id VARCHAR(36) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'recibida',
    document_status VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    version INT NOT NULL DEFAULT 1,
    submitted_at DATETIME NULL,
    assigned_recruiter_id VARCHAR(36) NULL,
    privacy_consent_at DATETIME NULL,
    privacy_consent_version VARCHAR(30) NULL,
    subsanacion_deadline DATETIME NULL,
    discard_reason_id VARCHAR(50) NULL,
    discard_note TEXT NULL,
    final_decision VARCHAR(50) NULL,
    final_decision_note TEXT NULL,
    final_decision_date DATETIME NULL,
    talent_bank_consent TINYINT(1) NOT NULL DEFAULT 0,
    talent_bank_consent_at DATETIME NULL,
    internal_notes TEXT NULL,
    evaluation_score INT NULL,
    ai_score INT NULL,
    ai_verdict VARCHAR(100) NULL,
    ai_summary TEXT NULL,
    ai_analyzed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_app_cand_vac (vacancy_id, candidate_id),
    INDEX idx_app_status (status),
    CONSTRAINT fk_app_vac FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE CASCADE,
    CONSTRAINT fk_app_cand FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_app_recruiter FOREIGN KEY (assigned_recruiter_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_app_resume FOREIGN KEY (resume_id) REFERENCES documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Actividades / Bitácora de Postulación
CREATE TABLE IF NOT EXISTS application_activities (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    author_id VARCHAR(36) NULL,
    event_type VARCHAR(30) NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NULL,
    note TEXT NULL,
    is_internal TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_act_app (application_id),
    CONSTRAINT fk_act_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_act_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Ítems de Hoja de Vida (HV-001 al HV-026)
CREATE TABLE IF NOT EXISTS application_items (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    section VARCHAR(60) NOT NULL,
    title VARCHAR(255) NOT NULL,
    data_json TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    reviewer_note TEXT NULL,
    is_subsanacion TINYINT(1) NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_item_app (application_id),
    INDEX idx_item_type (item_type),
    CONSTRAINT fk_item_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Soportes de Ítems
CREATE TABLE IF NOT EXISTS item_supports (
    id VARCHAR(36) PRIMARY KEY,
    item_id VARCHAR(36) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    storage_name VARCHAR(64) NOT NULL UNIQUE,
    media_type VARCHAR(100) NOT NULL,
    size INT NOT NULL,
    file_data LONGBLOB NULL,
    version INT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sup_item (item_id),
    CONSTRAINT fk_sup_item FOREIGN KEY (item_id) REFERENCES application_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Calificaciones de Ítems
CREATE TABLE IF NOT EXISTS item_reviews (
    id VARCHAR(36) PRIMARY KEY,
    item_id VARCHAR(36) NOT NULL,
    reviewer_id VARCHAR(36) NULL,
    result VARCHAR(30) NOT NULL,
    reason VARCHAR(255) NULL,
    observation TEXT NULL,
    reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rev_item (item_id),
    CONSTRAINT fk_rev_item FOREIGN KEY (item_id) REFERENCES application_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_rev_user FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Solicitudes de Subsanación
CREATE TABLE IF NOT EXISTS subsanacion_requests (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    requested_by_id VARCHAR(36) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    deadline DATETIME NOT NULL,
    items_summary TEXT NOT NULL,
    general_note TEXT NULL,
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    INDEX idx_subs_app (application_id),
    CONSTRAINT fk_subs_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_subs_user FOREIGN KEY (requested_by_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Franjas de Entrevista (Slots)
CREATE TABLE IF NOT EXISTS interview_slots (
    id VARCHAR(36) PRIMARY KEY,
    vacancy_id VARCHAR(36) NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    modality VARCHAR(30) NOT NULL DEFAULT 'virtual',
    location_or_link VARCHAR(255) NOT NULL DEFAULT '',
    max_capacity INT NOT NULL DEFAULT 1,
    is_available TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_slot_vac (vacancy_id),
    CONSTRAINT fk_slot_vac FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. Entrevistas Asignadas
CREATE TABLE IF NOT EXISTS interviews (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    slot_id VARCHAR(36) NULL,
    scheduled_at DATETIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 45,
    modality VARCHAR(30) NOT NULL DEFAULT 'virtual',
    location_or_link VARCHAR(255) NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL DEFAULT 'programada',
    candidate_notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_intr_app (application_id),
    CONSTRAINT fk_intr_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_intr_slot FOREIGN KEY (slot_id) REFERENCES interview_slots(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. Evaluaciones de Comité
CREATE TABLE IF NOT EXISTS interview_evaluations (
    id VARCHAR(36) PRIMARY KEY,
    interview_id VARCHAR(36) NOT NULL,
    evaluator_id VARCHAR(36) NULL,
    scores_json TEXT NOT NULL,
    total_score INT NOT NULL DEFAULT 0,
    concept VARCHAR(50) NOT NULL DEFAULT 'favorable',
    notes TEXT NULL,
    is_consolidated TINYINT(1) NOT NULL DEFAULT 0,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_eval_intr (interview_id),
    CONSTRAINT fk_eval_intr FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    CONSTRAINT fk_eval_user FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. Pruebas Psicotécnicas y de Conocimiento
CREATE TABLE IF NOT EXISTS test_results (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    test_type VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    score INT NOT NULL DEFAULT 0,
    max_score INT NOT NULL DEFAULT 100,
    passed TINYINT(1) NOT NULL DEFAULT 1,
    notes TEXT NULL,
    evaluated_by_id VARCHAR(36) NULL,
    evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_test_app (application_id),
    CONSTRAINT fk_test_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_evaluator FOREIGN KEY (evaluated_by_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. Prueba de Aula Docente (Desarrollo Profesoral)
CREATE TABLE IF NOT EXISTS classroom_tests (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL UNIQUE,
    topic VARCHAR(200) NOT NULL,
    rubric_json TEXT NOT NULL,
    score INT NOT NULL DEFAULT 0,
    passed TINYINT(1) NOT NULL DEFAULT 1,
    notes TEXT NULL,
    evaluator_id VARCHAR(36) NULL,
    evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_class_app (application_id),
    CONSTRAINT fk_class_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_class_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. Examen Médico Ocupacional (Salud Ocupacional CECAR)
CREATE TABLE IF NOT EXISTS occupational_exams (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL UNIQUE,
    provider VARCHAR(150) NOT NULL DEFAULT 'IPS Salud Ocupacional CECAR',
    fitness_concept VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    restrictions TEXT NULL,
    evaluated_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_exam_app (application_id),
    CONSTRAINT fk_exam_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. Expediente de Contratación
CREATE TABLE IF NOT EXISTS hiring_dossiers (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    checklist_json TEXT NOT NULL,
    responsible_id VARCHAR(36) NULL,
    formalization_date DATETIME NULL,
    contract_type VARCHAR(60) NULL DEFAULT 'Cátedra Universitaria',
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dos_app (application_id),
    CONSTRAINT fk_dos_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_dos_resp FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. Vinculación Laboral Institucional
CREATE TABLE IF NOT EXISTS employment_bindings (
    id VARCHAR(36) PRIMARY KEY,
    hiring_id VARCHAR(36) NOT NULL UNIQUE,
    application_id VARCHAR(36) NOT NULL UNIQUE,
    employee_code VARCHAR(50) NOT NULL UNIQUE,
    start_date DATETIME NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'vinculado',
    confirmed_by_id VARCHAR(36) NULL,
    confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bind_hiring (hiring_id),
    INDEX idx_bind_app (application_id),
    CONSTRAINT fk_bind_hiring FOREIGN KEY (hiring_id) REFERENCES hiring_dossiers(id) ON DELETE CASCADE,
    CONSTRAINT fk_bind_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_bind_user FOREIGN KEY (confirmed_by_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. Bitácora de Integración y Transferencia
CREATE TABLE IF NOT EXISTS institutional_integrations (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    destination_system VARCHAR(100) NOT NULL DEFAULT 'Sistema Hoja de Vida CECAR',
    status VARCHAR(30) NOT NULL DEFAULT 'transferido',
    attempts INT NOT NULL DEFAULT 1,
    error_message TEXT NULL,
    payload_json TEXT NOT NULL,
    transferred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_integ_app (application_id),
    CONSTRAINT fk_integ_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21. Catálogo de Causales de Descarte (RN-024)
CREATE TABLE IF NOT EXISTS discard_reasons (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. Mesa de Ayuda (Tickets de Soporte)
CREATE TABLE IF NOT EXISTS help_tickets (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    category VARCHAR(60) NOT NULL,
    subject VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'abierto',
    response TEXT NULL,
    responded_by_id VARCHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    INDEX idx_ticket_user (user_id),
    CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_responder FOREIGN KEY (responded_by_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 23. Planes de Trabajo
CREATE TABLE IF NOT EXISTS selection_work_plans (
    id VARCHAR(36) PRIMARY KEY,
    vacancy_id VARCHAR(36) NOT NULL UNIQUE,
    coordinator_id VARCHAR(36) NULL,
    start_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date DATETIME NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'activo',
    activities_json TEXT NOT NULL,
    CONSTRAINT fk_plan_vac FOREIGN KEY (vacancy_id) REFERENCES vacancies(id) ON DELETE CASCADE,
    CONSTRAINT fk_plan_coord FOREIGN KEY (coordinator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 24. Auditoría del Sistema
CREATE TABLE IF NOT EXISTS system_audits (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(60) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    before_data TEXT NULL,
    after_data TEXT NULL,
    ip_address VARCHAR(60) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_user (user_id),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 25. Parámetros del Sistema
CREATE TABLE IF NOT EXISTS system_parameters (
    id VARCHAR(50) PRIMARY KEY,
    `key` VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description VARCHAR(255) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- DATOS SEMILLA INSTITUCIONALES CECAR
-- ==============================================================================

-- Administrador CECAR y Lucas Tapia
INSERT INTO users (id, name, email, password_hash, role, faculty, campus, email_verified_at)
VALUES 
('a0000000-0000-0000-0000-000000000001', 'Administrador CECAR', 'admin@recruitpro.internal', '$argon2id$v=19$m=65536,t=3,p=4$dvtLAEUGZ96eW00Sc5pHMA$XMZ5CBcyF0c0DanwRCg6DConjnhetEAo56HEd9jgv/c', 'administrador', 'Gestión del Talento Humano', 'Sede Principal Sincelejo', NOW()),
('7c8ed709-87fc-404d-9dc3-e118d1f62191', 'Lucas Tapia', 'luctapi89@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$dvtLAEUGZ96eW00Sc5pHMA$XMZ5CBcyF0c0DanwRCg6DConjnhetEAo56HEd9jgv/c', 'administrador', 'Facultad de Educación y Ciencias Sociales', 'Sede Principal Sincelejo', NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Causales de Descarte Normativas CECAR (RN-024)
INSERT INTO discard_reasons (id, code, name, description, active)
VALUES
('formacion_no_cumple', 'DES-FORM', 'No cumple formación académica mínima', 'El candidato no acredita los títulos o niveles académicos requeridos para el cargo.', 1),
('experiencia_insuficiente', 'DES-EXP', 'Experiencia laboral o docente inferior al perfil', 'El tiempo o tipo de experiencia acreditada no alcanza el umbral mínimo exigido.', 1),
('soportes_no_subsanados', 'DES-SUBS', 'Documentos no subsanados en el plazo', 'Venció el plazo legal de subsanación sin que el aspirante corrigiera los ítems observados.', 1),
('no_supero_entrevista', 'DES-ENTR', 'Resultado no aprobatorio en entrevista de comité', 'El puntaje consolidado de entrevista no alcanzó la ponderación mínima requerida.', 1),
('no_supero_prueba_aula', 'DES-AULA', 'No superó prueba de aula docente institucional', 'El dictamen de la prueba de aula emitido por Desarrollo Profesoral no fue aprobatorio.', 1),
('desistimiento_voluntario', 'DES-DESIST', 'Desistimiento voluntario del aspirante', 'El candidato solicitó formalmente el retiro de su postulación del proceso.', 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Convocatorias Iniciales CECAR
INSERT INTO vacancies (id, code, title, type, location, faculty, program, campus, academic_period, vacancies_count, modality, description, status, opening_date, closing_date, recruiter_id)
VALUES
('f77546e6-aa0f-4346-8b25-e83f644eb134', 'CONV-2026-DOC-01', 'Aspirante: Nuevo a docente cátedra', 'Cátedra Universitaria', 'Sincelejo, Sucre', 'Facultad de Educación y Ciencias Sociales', 'Licenciatura en Educación Infantil', 'Sede Principal Sincelejo', '2026-2', 2, 'Presencial', 'Convocatoria pública institucional de méritos para proveer horas de cátedra docente en el programa de Licenciatura en Educación Infantil. Se requiere título profesional en educación o áreas afines, especialización o maestría y mínimo 1 año de experiencia docente universitaria.', 'active', NOW() - INTERVAL 5 DAY, NOW() + INTERVAL 25 DAY, '7c8ed709-87fc-404d-9dc3-e118d1f62191'),
('e928ec9d-4615-4dd3-ba17-81438fb5b0fd', 'CONV-2026-ING-02', 'Docente Tiempo Completo - Ingeniería de Software y Sistemas', 'Tiempo completo', 'Sincelejo / Híbrido', 'Facultad de Ingeniería', 'Ingeniería de Sistemas', 'Sede Principal Sincelejo', '2026-2', 1, 'Tiempo Completo', 'Convocatoria para docente de tiempo completo en áreas de ingeniería de software, arquitectura en la nube y desarrollo web. Requisitos: Profesional en Ingeniería de Sistemas, Maestría afín, experiencia investigativa demostrable.', 'active', NOW() - INTERVAL 2 DAY, NOW() + INTERVAL 30 DAY, '7c8ed709-87fc-404d-9dc3-e118d1f62191')
ON DUPLICATE KEY UPDATE title=VALUES(title);

SET FOREIGN_KEY_CHECKS = 1;
