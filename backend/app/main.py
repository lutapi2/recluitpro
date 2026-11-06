import os
import shutil
import logging
import re
import secrets
import smtplib
import zipfile
import json
from contextlib import asynccontextmanager
from html import escape
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from typing import Literal, Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from .database import Base, engine, get_db
from .email_service import send_email
from .ai_service import analyze_compatibility, extract_text_from_file
from .models import (
    Application,
    ApplicationActivity,
    ApplicationItem,
    AuthSession,
    ClassroomTest,
    DiscardReason,
    Document,
    EmailToken,
    EmploymentBinding,
    HelpTicket,
    HiringDossier,
    InstitutionalIntegration,
    Interview,
    InterviewEvaluation,
    InterviewSlot,
    ItemReview,
    ItemSupport,
    OccupationalExam,
    Role,
    SelectionWorkPlan,
    SubsanacionRequest,
    SystemAudit,
    SystemParameter,
    TestResult,
    User,
    Vacancy,
    utc_now,
)
from .security import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    clear_session,
    create_session,
    current_user,
    hash_token,
    password_hash,
    require_role,
    set_csrf_cookie,
    verify_csrf,
)

DUMMY_PASSWORD_HASH = password_hash.hash("RecruitPro-invalid-login-dummy-secret")

ROOT = Path(__file__).resolve().parents[2]
if os.name != "nt":
    default_data_dir = Path("/tmp/recruitpro-data")
else:
    default_data_dir = ROOT.parent / "recruitpro-data"
DATA_DIR = Path(os.getenv("DATA_DIR", str(default_data_dir))).resolve()
if DATA_DIR == ROOT or ROOT in DATA_DIR.parents:
    raise RuntimeError("DATA_DIR debe estar fuera de la carpeta pública del proyecto.")
UPLOAD_DIR = DATA_DIR / "private_uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024
PRIVACY_CONSENT_VERSION = "2026-10-neutral-1"

def generate_fallback_pdf(name: str, email: str, doc_name: str) -> bytes:
    clean_name = re.sub(r'[^a-zA-Z0-9 ._-]', ' ', name).strip() or "Candidato"
    clean_email = re.sub(r'[^a-zA-Z0-9 .@_-]', ' ', email).strip() or "correo@ejemplo.com"
    clean_doc = re.sub(r'[^a-zA-Z0-9 ._-]', ' ', doc_name).strip() or "cv.pdf"
    stream = (
        "BT\n"
        "/F1 20 Tf\n"
        "50 720 Td\n"
        f"(Curriculum Vitae - {clean_name}) Tj\n"
        "0 -35 Td\n"
        "/F1 12 Tf\n"
        f"(Correo electronico: {clean_email}) Tj\n"
        "0 -22 Td\n"
        f"(Documento adjunto: {clean_doc}) Tj\n"
        "0 -35 Td\n"
        "/F1 13 Tf\n"
        "(Perfil Profesional y Competencias Evaluadas por RecruitPro AI) Tj\n"
        "0 -25 Td\n"
        "/F1 11 Tf\n"
        "(Postulacion registrada y verificada en la plataforma corporativa RecruitPro.) Tj\n"
        "0 -20 Td\n"
        "(Experiencia tecnica en desarrollo de software, arquitectura de sistemas y trabajo en equipo.) Tj\n"
        "ET"
    )
    stream_bytes = stream.encode("latin1")
    pdf_content = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        b"4 0 obj\n<< /Length " + str(len(stream_bytes)).encode("ascii") + b" >>\nstream\n"
        + stream_bytes + b"\nendstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n"
        b"0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000300 00000 n \n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n380\n%%EOF\n"
    )
    return pdf_content

APPLICATION_STATUSES = (
    "borrador", "recibida", "enviada", "en_revision", "subsanacion_requerida",
    "habilitada", "preseleccionada", "entrevista", "entrevistada",
    "seleccionada", "no_seleccionada", "no_continua", "oferta",
    "examen_ocupacional", "en_contratacion", "vinculada", "rechazada", "retirada"
)
RETENTION_MONTHS = max(1, int(os.getenv("RETENTION_MONTHS", "24")))
ALLOWED_FILES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".doc": ("application/msword", bytes.fromhex("D0CF11E0A1B11AE1")),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b"PK\x03\x04",
    ),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    seed_dir = ROOT / "backend" / "seed_uploads"
    if seed_dir.is_dir():
        for sf in seed_dir.glob("*"):
            if sf.is_file():
                tf = UPLOAD_DIR / sf.name
                if not tf.exists():
                    try:
                        shutil.copy2(sf, tf)
                    except Exception:
                        pass
    Base.metadata.create_all(bind=engine)
    try:
        from sqlalchemy import inspect, text
        with engine.connect() as conn:
            inspector = inspect(conn)
            is_pg = engine.dialect.name.startswith("postgres")
            dt_t = "TIMESTAMP" if is_pg else "DATETIME"
            b0 = "BOOLEAN DEFAULT FALSE" if is_pg else "BOOLEAN DEFAULT 0"
            b1 = "BOOLEAN DEFAULT TRUE" if is_pg else "BOOLEAN DEFAULT 1"
            col_migrations = {
                'users': [
                    ('faculty', 'VARCHAR(150)'),
                    ('campus', 'VARCHAR(100)'),
                    ('is_active', b1),
                ],
                'vacancies': [
                    ('code', 'VARCHAR(50)'),
                    ('faculty', 'VARCHAR(150)'),
                    ('program', 'VARCHAR(150)'),
                    ('campus', 'VARCHAR(100)'),
                    ('academic_period', 'VARCHAR(30)'),
                    ('vacancies_count', 'INTEGER DEFAULT 1'),
                    ('modality', 'VARCHAR(50)'),
                    ('opening_date', dt_t),
                    ('closing_date', dt_t),
                    ('profile_json', 'TEXT'),
                    ('requirements_config_json', 'TEXT'),
                    ('criteria_config_json', 'TEXT'),
                    ('stages_config_json', 'TEXT'),
                ],
                'applications': [
                    ('document_status', 'VARCHAR(30) DEFAULT \'pendiente\''),
                    ('version', 'INTEGER DEFAULT 1'),
                    ('submitted_at', dt_t),
                    ('subsanacion_deadline', dt_t),
                    ('discard_reason_id', 'VARCHAR(50)'),
                    ('discard_note', 'TEXT'),
                    ('final_decision', 'VARCHAR(50)'),
                    ('final_decision_note', 'TEXT'),
                    ('final_decision_date', dt_t),
                    ('talent_bank_consent', b0),
                    ('talent_bank_consent_at', dt_t),
                    ('internal_notes', 'TEXT'),
                    ('evaluation_score', 'INTEGER'),
                ],
                'application_activities': [
                    ('is_internal', b0),
                ]
            }
            existing_tables = inspector.get_table_names()
            for table_name, cols in col_migrations.items():
                if table_name in existing_tables:
                    existing_cols = [c["name"] for c in inspector.get_columns(table_name)]
                    for col_name, col_type in cols:
                        if col_name not in existing_cols:
                            try:
                                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
                                conn.commit()
                            except Exception:
                                conn.rollback()
            
            # Check documents.file_data
            if "documents" in existing_tables:
                cols = [c["name"] for c in inspector.get_columns("documents")]
                if "file_data" not in cols:
                    sql_type = "BYTEA" if is_pg else "BLOB"
                    try:
                        conn.execute(text(f"ALTER TABLE documents ADD COLUMN file_data {sql_type}"))
                        conn.commit()
                    except Exception:
                        conn.rollback()
    except Exception as exc:
        logging.getLogger("recruitpro").warning("Startup migration notice: %s", exc)

    try:
        from .database import SessionLocal
        with SessionLocal() as db:
            try:
                if not db.scalar(select(User.id).where(User.email == "admin@recruitpro.internal").limit(1)):
                    db.add(User(
                        id="a0000000-0000-0000-0000-000000000001",
                        name="Administrador CECAR",
                        email="admin@recruitpro.internal",
                        password_hash=password_hash.hash("admin-password-1234"),
                        role=Role.ADMIN,
                        faculty="Gestión del Talento Humano",
                        campus="Sede Principal Sincelejo",
                        email_verified_at=utc_now(),
                        last_activity_at=utc_now(),
                        privacy_consent_at=utc_now(),
                        privacy_consent_version=PRIVACY_CONSENT_VERSION,
                    ))
                    db.commit()
            except Exception:
                db.rollback()

            admin_user = None
            try:
                admin_user = db.scalar(select(User).where(User.email == "luctapi89@gmail.com").limit(1))
                if not admin_user:
                    new_admin = User(
                        id="7c8ed709-87fc-404d-9dc3-e118d1f62191",
                        name="Lucas Tapia",
                        email="luctapi89@gmail.com",
                        password_hash="$argon2id$v=19$m=65536,t=3,p=4$dvtLAEUGZ96eW00Sc5pHMA$XMZ5CBcyF0c0DanwRCg6DConjnhetEAo56HEd9jgv/c",
                        role=Role.ADMIN,
                        faculty="Facultad de Educación y Ciencias Sociales",
                        campus="Sede Principal Sincelejo",
                        email_verified_at=utc_now(),
                        last_activity_at=utc_now(),
                        privacy_consent_at=utc_now(),
                        privacy_consent_version=PRIVACY_CONSENT_VERSION,
                    )
                    db.add(new_admin)
                    db.commit()
                    admin_user = new_admin
            except Exception:
                db.rollback()

            # Seed Discard Reasons
            default_discard_reasons = [
                ("formacion_no_cumple", "DES-FORM", "No cumple formación académica mínima", "El candidato no acredita los títulos o niveles académicos requeridos para el cargo."),
                ("experiencia_insuficiente", "DES-EXP", "Experiencia laboral o docente inferior al perfil", "El tiempo o tipo de experiencia acreditada no alcanza el umbral mínimo exigido."),
                ("soportes_no_subsanados", "DES-SUBS", "Documentos no subsanados en el plazo", "Venció el plazo legal de subsanación sin que el aspirante corrigiera los ítems observados."),
                ("no_supero_entrevista", "DES-ENTR", "Resultado no aprobatorio en entrevista de comité", "El puntaje consolidado de entrevista no alcanzó la ponderación mínima requerida."),
                ("no_supero_prueba_aula", "DES-AULA", "No superó prueba de aula docente institucional", "El dictamen de la prueba de aula emitido por Desarrollo Profesoral no fue aprobatorio."),
                ("desistimiento_voluntario", "DES-DESIST", "Desistimiento voluntario del aspirante", "El candidato solicitó formalmente el retiro de su postulación del proceso."),
            ]
            for dr_id, dr_code, dr_name, dr_desc in default_discard_reasons:
                try:
                    if not db.scalar(select(DiscardReason.id).where(DiscardReason.id == dr_id).limit(1)):
                        db.add(DiscardReason(id=dr_id, code=dr_code, name=dr_name, description=dr_desc, active=True))
                        db.commit()
                except Exception:
                    db.rollback()

            # Seed CECAR Vacancies
            cecar_vacancies_data = [
                (
                    "f77546e6-aa0f-4346-8b25-e83f644eb134",
                    "CONV-2026-DOC-01",
                    "Aspirante: Nuevo a docente cátedra",
                    "Cátedra Universitaria",
                    "Sincelejo, Sucre",
                    "Facultad de Educación y Ciencias Sociales",
                    "Licenciatura en Educación Infantil",
                    "Sede Principal Sincelejo",
                    "2026-2",
                    2,
                    "Presencial",
                    "Convocatoria pública institucional de méritos para proveer horas de cátedra docente en el programa de Licenciatura en Educación Infantil. Se requiere título profesional en educación o áreas afines, especialización o maestría y mínimo 1 año de experiencia docente universitaria.",
                    5,
                    25,
                ),
                (
                    "e928ec9d-4615-4dd3-ba17-81438fb5b0fd",
                    "CONV-2026-ING-02",
                    "Docente Tiempo Completo - Ingeniería de Software y Sistemas",
                    "Tiempo completo",
                    "Sincelejo / Híbrido",
                    "Facultad de Ingeniería",
                    "Ingeniería de Sistemas",
                    "Sede Principal Sincelejo",
                    "2026-2",
                    1,
                    "Tiempo Completo",
                    "Convocatoria para docente de tiempo completo en áreas de ingeniería de software, arquitectura en la nube y desarrollo web. Requisitos: Profesional en Ingeniería de Sistemas, Maestría afín, experiencia investigativa demostrable.",
                    2,
                    30,
                ),
            ]
            valid_recruiter_id = admin_user.id if admin_user else None
            for v_id, v_code, v_title, v_type, v_loc, v_fac, v_prog, v_camp, v_per, v_cnt, v_mod, v_desc, d_open, d_close in cecar_vacancies_data:
                try:
                    exists = db.scalar(select(Vacancy.id).where(or_(Vacancy.id == v_id, Vacancy.code == v_code)).limit(1))
                    if not exists:
                        db.add(Vacancy(
                            id=v_id,
                            code=v_code,
                            title=v_title,
                            type=v_type,
                            location=v_loc,
                            faculty=v_fac,
                            program=v_prog,
                            campus=v_camp,
                            academic_period=v_per,
                            vacancies_count=v_cnt,
                            modality=v_mod,
                            description=v_desc,
                            status="active",
                            opening_date=utc_now() - timedelta(days=d_open),
                            closing_date=utc_now() + timedelta(days=d_close),
                            recruiter_id=valid_recruiter_id,
                        ))
                        db.commit()
                except Exception:
                    db.rollback()
    except Exception as exc:
        logging.getLogger("recruitpro").warning("Startup seed notice: %s", exc)
    yield


app = FastAPI(title="RecruitPro | Sistema de Selección CECAR", version="3.0.0", lifespan=lifespan)
logger = logging.getLogger("recruitpro")


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    role: str | None = None
    privacy_consent: bool


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class VacancyRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=60)
    code: str | None = None
    location: str = Field(default="", max_length=100)
    faculty: str | None = "Facultad de Educación y Ciencias Sociales"
    program: str | None = "Licenciatura en Educación Infantil"
    campus: str | None = "Sede Principal Sincelejo"
    academic_period: str | None = "2026-2"
    vacancies_count: int = 1
    modality: str | None = "Presencial"
    description: str = Field(min_length=1, max_length=5000)
    recruiter_id: str | None = None
    status: str = "active"


class ProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=30)
    location: str = Field(default="", max_length=100)


class AdminUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    role: str = "candidato"
    faculty: str | None = "Facultad de Educación y Ciencias Sociales"
    campus: str | None = "Sede Principal Sincelejo"


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class PasswordResetRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=12, max_length=128)


class DeleteAccountRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)


class TokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class ApplicationUpdateRequest(BaseModel):
    status: Literal[
        "borrador", "recibida", "enviada", "en_revision", "subsanacion_requerida",
        "habilitada", "preseleccionada", "entrevista", "entrevistada",
        "seleccionada", "no_seleccionada", "no_continua", "oferta",
        "examen_ocupacional", "en_contratacion", "vinculada", "rechazada", "retirada"
    ] | None = None
    note: str | None = Field(default=None, max_length=2000)
    assigned_recruiter_id: str | None = None


# --- Pydantic Models for Specific System Requirements ---
class ItemCreateRequest(BaseModel):
    item_type: str = Field(min_length=2, max_length=50) # HV-006, etc.
    section: str = Field(min_length=2, max_length=60)   # formacion, experiencia, etc.
    title: str = Field(min_length=1, max_length=255)
    data: dict[str, Any] = Field(default_factory=dict)


class ItemUpdateRequest(BaseModel):
    title: str | None = None
    data: dict[str, Any] | None = None


class ItemReviewRequest(BaseModel):
    result: Literal["aprobado", "observado", "rechazado"]
    reason: str | None = None
    observation: str | None = None


class SubsanacionCreateRequest(BaseModel):
    days: int = Field(default=5, ge=1, le=30)
    general_note: str | None = None


class PreselectRequest(BaseModel):
    justification: str | None = "Cumple con los requisitos mínimos documentales y de perfil."


class DiscardRequest(BaseModel):
    discard_reason_id: str
    note: str = Field(min_length=3, max_length=1000)


class InternalNoteRequest(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class InterviewSlotCreateRequest(BaseModel):
    vacancy_id: str
    start_time: datetime
    end_time: datetime
    modality: Literal["presencial", "virtual"] = "virtual"
    location_or_link: str = ""
    max_capacity: int = 1


class InterviewScheduleRequest(BaseModel):
    slot_id: str | None = None
    scheduled_at: datetime
    duration_minutes: int = 45
    modality: Literal["presencial", "virtual"] = "virtual"
    location_or_link: str = ""
    committee_members: list[str] = Field(default_factory=list)


class InterviewRespondRequest(BaseModel):
    action: Literal["confirmar", "reprogramar"]
    reason: str | None = None


class InterviewEvaluationRequest(BaseModel):
    criteria_scores: dict[str, int] = Field(default_factory=dict)
    total_score: int = Field(ge=0, le=100)
    concept: Literal["favorable", "favorable_con_reservas", "no_favorable"]
    notes: str | None = None


class TestResultCreateRequest(BaseModel):
    test_type: Literal["psicotecnica", "conocimiento"]
    name: str = Field(min_length=1, max_length=120)
    score: int = Field(ge=0, le=100)
    passed: bool = True
    notes: str | None = None


class ClassroomTestCreateRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    rubric: dict[str, Any] = Field(default_factory=dict)
    score: int = Field(ge=0, le=100)
    passed: bool = True
    notes: str | None = None


class OccupationalExamRequest(BaseModel):
    provider: str = "IPS Salud Ocupacional CECAR"
    fitness_concept: Literal["apto", "apto_con_restricciones", "no_apto", "pendiente"]
    restrictions: str | None = None


class HiringDossierRequest(BaseModel):
    checklist: dict[str, bool] = Field(default_factory=dict)
    contract_status: Literal["pendiente", "en_tramite", "firmado", "rechazado", "formalizado"] = "en_tramite"
    contract_type: str = "Cátedra Universitaria"
    notes: str | None = None


class ConfirmBindingRequest(BaseModel):
    employee_code: str = Field(min_length=2, max_length=50)
    start_date: datetime


class HelpTicketCreateRequest(BaseModel):
    category: str = Field(min_length=1, max_length=60)
    subject: str = Field(min_length=3, max_length=150)
    message: str = Field(min_length=5, max_length=2000)


class HelpTicketReplyRequest(BaseModel):
    response: str = Field(min_length=1, max_length=2000)


class DraftApplicationRequest(BaseModel):
    vacancy_id: str
    privacy_consent: bool


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        raise HTTPException(status_code=422, detail="Escribe un correo electrónico válido.")
    return normalized


def issue_email_token(db: Session, user: User, purpose: str) -> str:
    db.query(EmailToken).filter(
        EmailToken.user_id == user.id,
        EmailToken.purpose == purpose,
    ).delete(synchronize_session=False)
    token = secrets.token_urlsafe(36)
    expires_in = timedelta(hours=1) if purpose == "password_reset" else timedelta(hours=24)
    db.add(
        EmailToken(
            user_id=user.id,
            token_hash=hash_token(token),
            purpose=purpose,
            expires_at=utc_now() + expires_in,
        )
    )
    db.commit()
    return token


def consume_email_token(db: Session, token: str, purpose: str) -> EmailToken:
    email_token = db.scalar(
        select(EmailToken)
        .options(joinedload(EmailToken.user))
        .where(
            EmailToken.token_hash == hash_token(token),
            EmailToken.purpose == purpose,
        )
    )
    expires_at = email_token.expires_at if email_token else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not email_token or not expires_at or expires_at <= utc_now():
        raise HTTPException(status_code=400, detail="El enlace no es válido o ya expiró.")
    return email_token


def send_account_email(recipient: str, subject: str, heading: str, detail: str, link: str) -> None:
    text_body = f"{heading}\n\n{detail}\n\n{link}\n\nSi no solicitaste esta acción, ignora este correo."
    safe_heading = escape(heading)
    safe_detail = escape(detail)
    safe_link = escape(link, quote=True)
    html_body = (
        f"<h1>{safe_heading}</h1><p>{safe_detail}</p>"
        f'<p><a href="{safe_link}">Continuar en RecruitPro</a></p>'
        "<p>Si no solicitaste esta acción, ignora este correo.</p>"
    )
    send_email(recipient, subject, text_body, html_body)


def notify_user(recipient: str, subject: str, message: str) -> bool:
    try:
        send_email(
            recipient,
            subject,
            message,
            f"<p>{escape(message)}</p>",
        )
        return True
    except (OSError, smtplib.SMTPException):
        logger.exception("No se pudo enviar el correo a %s", recipient)
        return False


def notify_account_link(
    recipient: str,
    subject: str,
    heading: str,
    detail: str,
    link: str,
) -> bool:
    try:
        send_account_email(recipient, subject, heading, detail, link)
        return True
    except (OSError, smtplib.SMTPException):
        logger.exception("No se pudo enviar el correo a %s", recipient)
        return False


def user_data(user: User, db: Session, viewer: User) -> dict:
    documents = []
    can_view_documents = viewer.role == Role.ADMIN or viewer.id == user.id
    if not can_view_documents and viewer.role in (Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER):
        can_view_documents = db.scalar(
            select(Application.id)
            .join(Vacancy, Application.vacancy_id == Vacancy.id)
            .where(
                Application.candidate_id == user.id,
                or_(
                    Vacancy.recruiter_id == viewer.id,
                    Application.assigned_recruiter_id == viewer.id,
                ),
            )
            .limit(1)
        ) is not None
    if can_view_documents:
        documents = [
            {
                "id": document.id,
                "name": document.original_name,
                "type": document.media_type,
                "size": document.size,
            }
            for document in user.documents
        ]
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
        "phone": user.phone,
        "location": user.location,
        "faculty": getattr(user, "faculty", "Facultad de Educación y Ciencias Sociales"),
        "campus": getattr(user, "campus", "Sede Principal Sincelejo"),
        "emailVerified": user.email_verified_at is not None,
        "privacyConsentAt": (
            user.privacy_consent_at.isoformat() if user.privacy_consent_at else None
        ),
        "privacyConsentVersion": user.privacy_consent_version,
        "documents": documents,
    }


def vacancy_data(vacancy: Vacancy, viewer: User, *, include_page_details: bool = True) -> dict:
    recruiter = vacancy.recruiter
    is_staff = viewer.role in (Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER)
    can_manage_vacancy = viewer.role == Role.ADMIN or (
        viewer.role in (Role.RECRUITER, Role.TALENTO_HUMANO) and vacancy.recruiter_id == viewer.id
    )
    visible_applications = vacancy.applications
    if viewer.role == Role.RECRUITER and not can_manage_vacancy:
        visible_applications = [
            item for item in vacancy.applications if item.assigned_recruiter_id == viewer.id
        ]
    can_see_applications = viewer.role == Role.ADMIN or (
        is_staff and bool(visible_applications)
    )
    applications = []
    if can_see_applications:
        applications = [
            {
                "id": item.id,
                "email": item.candidate.email if item.candidate else "",
                "name": item.name,
                "phone": item.phone,
                "location": item.location,
                "resumeId": item.resume_id,
                "resumeName": item.resume.original_name if item.resume else "",
                "aiScore": item.ai_score,
                "aiVerdict": item.ai_verdict,
                "aiSummary": item.ai_summary,
                "appliedAt": item.created_at.isoformat(),
                "status": item.status,
                "documentStatus": getattr(item, "document_status", "pendiente"),
                "version": getattr(item, "version", 1),
                "assignedRecruiterId": item.assigned_recruiter_id,
                "assignedRecruiterName": (
                    item.assigned_recruiter.name if item.assigned_recruiter else ""
                ),
                "activities": [
                    {
                        "type": activity.event_type,
                        "fromStatus": activity.from_status,
                        "toStatus": activity.to_status,
                        "note": activity.note,
                        "author": activity.author.name if activity.author else "Sistema",
                        "createdAt": activity.created_at.isoformat(),
                    }
                    for activity in item.activities
                ],
            }
            for item in visible_applications
        ]
    return {
        "id": vacancy.id,
        "code": getattr(vacancy, "code", "CONV-2026"),
        "title": vacancy.title,
        "type": vacancy.type,
        "location": vacancy.location,
        "faculty": getattr(vacancy, "faculty", "Facultad de Educación y Ciencias Sociales"),
        "program": getattr(vacancy, "program", "Licenciatura en Educación Infantil"),
        "campus": getattr(vacancy, "campus", "Sede Principal Sincelejo"),
        "academicPeriod": getattr(vacancy, "academic_period", "2026-2"),
        "vacanciesCount": getattr(vacancy, "vacancies_count", 1),
        "modality": getattr(vacancy, "modality", "Presencial"),
        "description": vacancy.description,
        "status": vacancy.status,
        "openingDate": vacancy.opening_date.isoformat() if getattr(vacancy, "opening_date", None) else None,
        "closingDate": vacancy.closing_date.isoformat() if getattr(vacancy, "closing_date", None) else None,
        "createdAt": vacancy.created_at.isoformat(),
        "recruiter": {
            "id": recruiter.id,
            "name": recruiter.name,
            "email": recruiter.email,
        } if recruiter else None,
        "applications": applications,
    }


def save_upload(upload: UploadFile) -> tuple[Path, str, str, int, bytes]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    extension = Path(upload.filename or "").suffix.lower()
    if extension not in ALLOWED_FILES:
        raise HTTPException(
            status_code=415,
            detail="Solo se permiten archivos en formato PDF, Word (DOC/DOCX) o imagen (PNG/JPG).",
        )
    expected_type, signature = ALLOWED_FILES[extension]
    content = upload.file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="El archivo excede el tamaño máximo permitido (10 MB).")
    if not content.startswith(signature):
        raise HTTPException(status_code=415, detail="El contenido del archivo no coincide con su extensión.")
    storage_name = f"{uuid4()}{extension}"
    target = UPLOAD_DIR / storage_name
    target.write_bytes(content)
    media_type = upload.content_type or expected_type
    return target, storage_name, media_type, len(content), content


def can_access_document(viewer: User, document: Document, db: Session) -> bool:
    if viewer.role == Role.ADMIN or document.owner_id == viewer.id:
        return True
    if viewer.role not in (Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER, Role.INTERVIEWER):
        return False
    return (
        db.scalar(
            select(Application.id)
            .join(Vacancy, Application.vacancy_id == Vacancy.id)
            .where(
                Application.candidate_id == document.owner_id,
                or_(
                    Vacancy.recruiter_id == viewer.id,
                    Application.assigned_recruiter_id == viewer.id,
                    viewer.role in (Role.ADMIN, Role.TALENTO_HUMANO, Role.REVIEWER),
                ),
            )
            .limit(1)
        ) is not None
    )


def recalculate_document_status(application: Application, db: Session) -> str:
    items = db.scalars(select(ApplicationItem).where(ApplicationItem.application_id == application.id)).all()
    if not items:
        return "pendiente"
    statuses = [it.status for it in items]
    if any(s == "observado" for s in statuses):
        return "observado"
    if any(s == "rechazado" for s in statuses):
        return "no_conforme"
    if all(s == "aprobado" for s in statuses):
        return "conforme"
    return "pendiente"


# ==============================================================================
# AUTH & SEGURIDAD (RF-001 a RF-005, RNF-009 a RNF-012)
# ==============================================================================

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/auth/csrf")
def csrf(request: Request, response: Response):
    token = request.cookies.get(CSRF_COOKIE)
    if not token:
        token = secrets.token_urlsafe(32)
    set_csrf_cookie(response, token)
    return {"csrfToken": token}


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    verify_csrf(request)
    if not payload.privacy_consent:
        raise HTTPException(status_code=422, detail="Debes aceptar el aviso de privacidad para crear una cuenta.")
    email = normalize_email(payload.email)
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Escribe tu nombre.")
    
    existing_user = db.scalar(select(User.id).where(User.email == email).limit(1))
    if existing_user:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con este correo.")

    user = User(
        id=str(uuid4()),
        name=payload.name.strip(),
        email=email,
        password_hash=password_hash.hash(payload.password),
        role=Role.CANDIDATE,
        email_verified_at=utc_now(),
        last_activity_at=utc_now(),
        privacy_consent_at=utc_now(),
        privacy_consent_version=PRIVACY_CONSENT_VERSION,
        faculty="Facultad de Educación y Ciencias Sociales",
        campus="Sede Principal Sincelejo",
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as error:
        db.rollback()
        logger.exception("Error al registrar cuenta: %s", error)
        raise HTTPException(status_code=500, detail="Error interno al registrar la cuenta.") from error

    create_session(response, db, user, request)
    return {
        "message": "Cuenta creada y activada exitosamente.",
        "emailSent": False,
        "token": "auto-verified",
        "redirect": "dashboard.html",
        "user": user_data(user, db, user),
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    verify_csrf(request)
    email = normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email))
    stored_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_matches = password_hash.verify(payload.password, stored_hash)
    if not user or not password_matches:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")
    # email verification completely disabled - auto-verify if needed
    if user.email_verified_at is None:
        user.email_verified_at = utc_now()
    user.last_activity_at = utc_now()
    db.commit()
    create_session(response, db, user, request)
    return user_data(user, db, user)


@app.get("/api/auth/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    return user_data(user, db, user)


@app.post("/api/auth/verify-email")
def verify_email(payload: TokenRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    verify_csrf(request)
    email_token = consume_email_token(db, payload.token, "verify_email")
    user = email_token.user
    user.email_verified_at = utc_now()
    user.last_activity_at = utc_now()
    db.delete(email_token)
    db.commit()
    create_session(response, db, user, request)
    notify_account_link(
        user.email,
        "Tu cuenta de RecruitPro está activa",
        "Correo verificado",
        "Tu cuenta ya está verificada y puedes comenzar a usar RecruitPro.",
        os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/")) + "/",
    )
    return user_data(user, db, user)


@app.post("/api/auth/verification/resend", status_code=202)
def resend_verification(payload: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    email = normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email))
    if user and user.email_verified_at is None:
        token = issue_email_token(db, user, "verify_email")
        link = (
            os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
            + f"/verificar.html?token={quote(token)}"
        )
        notify_account_link(
            user.email,
            "Activa tu cuenta de RecruitPro",
            f"Hola, {user.name}",
            "Confirma tu correo electrónico para comenzar a usar RecruitPro:",
            link,
        )
    return {"message": "Si la cuenta existe y no está verificada, enviamos un nuevo enlace."}


@app.post("/api/auth/password-reset", status_code=202)
def password_reset(payload: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    email = normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email))
    if user:
        token = issue_email_token(db, user, "password_reset")
        link = (
            os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
            + f"/restablecer.html?token={quote(token)}"
        )
        notify_account_link(
            user.email,
            "Recupera tu acceso a RecruitPro",
            "Restablecimiento de contraseña",
            "Recibimos una solicitud para restablecer tu contraseña. Usa este enlace para continuar:",
            link,
        )
    return {"message": "Si la cuenta existe, enviamos un enlace para restablecer tu contraseña."}


@app.post("/api/auth/password-reset/confirm")
def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    email_token = consume_email_token(db, payload.token, "password_reset")
    user = email_token.user
    user.password_hash = password_hash.hash(payload.new_password)
    user.last_activity_at = utc_now()
    db.delete(email_token)
    db.query(AuthSession).filter(AuthSession.user_id == user.id).delete()
    db.commit()
    create_session(response, db, user, request)
    notify_user(
        user.email,
        "Tu contraseña de RecruitPro fue actualizada",
        "Tu contraseña fue modificada correctamente. Si no realizaste este cambio, contáctanos de inmediato.",
    )
    return user_data(user, db, user)


@app.post("/api/auth/password")
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    if not password_hash.verify(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    user.password_hash = password_hash.hash(payload.new_password)
    user.last_activity_at = utc_now()
    db.commit()
    notify_user(
        user.email,
        "Tu contraseña de RecruitPro fue actualizada",
        "Tu contraseña fue modificada correctamente.",
    )
    return {"message": "Contraseña actualizada."}


@app.delete("/api/auth/account", status_code=204)
def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    if not password_hash.verify(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    for document in user.documents:
        (UPLOAD_DIR / document.storage_name).unlink(missing_ok=True)
    db.delete(user)
    db.commit()
    clear_session(response)
    return Response(status_code=204)


@app.get("/api/privacy")
def privacy_notice():
    return {
        "version": PRIVACY_CONSENT_VERSION,
        "retentionMonths": RETENTION_MONTHS,
        "policy": "Tratamiento de datos personales de la Corporación Universitaria del Caribe - CECAR conforme a la Ley 1581 de 2012 y política de talento humano.",
    }


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.query(AuthSession).filter(AuthSession.token_hash == hash_token(token)).delete()
        db.commit()
    clear_session(response)
    return Response(status_code=204)


# ==============================================================================
# CATÁLOGOS Y PARÁMETROS DEL SISTEMA (RF-080, RF-097)
# ==============================================================================

@app.get("/api/catalogos")
def get_catalogos(db: Session = Depends(get_db)):
    discard_reasons = db.scalars(select(DiscardReason).where(DiscardReason.active == True)).all()
    
    # Catálogo de 26 ítems según especificación ampliada HV-001 a HV-026
    tipos_items_hv = [
        {"id": "HV-001", "section": "consentimientos", "name": "Autorización de tratamiento de datos", "soporte": "Aceptación electrónica", "obligatorio": True},
        {"id": "HV-002", "section": "identificacion", "name": "Documento de identidad", "soporte": "Copia del documento", "obligatorio": False, "condicional": True},
        {"id": "HV-003", "section": "datos_personales", "name": "Nombres y apellidos completos", "soporte": "Documento de identidad", "obligatorio": True},
        {"id": "HV-004", "section": "contacto", "name": "Información de contacto (correo, teléfono, ciudad)", "soporte": "Sin soporte inicial", "obligatorio": True},
        {"id": "HV-005", "section": "perfil", "name": "Resumen del perfil profesional", "soporte": "Sin soporte directo", "obligatorio": False},
        {"id": "HV-006", "section": "formacion", "name": "Título de pregrado", "soporte": "Diploma o acta de grado", "obligatorio": True, "condicional": True, "repetible": True},
        {"id": "HV-007", "section": "formacion", "name": "Título de posgrado (Especialización, Maestría, Doctorado)", "soporte": "Diploma o acta de grado", "obligatorio": False, "condicional": True, "repetible": True},
        {"id": "HV-008", "section": "formacion", "name": "Estudio en curso", "soporte": "Certificado de estudio vigente", "obligatorio": False, "repetible": True},
        {"id": "HV-009", "section": "experiencia", "name": "Experiencia laboral", "soporte": "Certificación laboral", "obligatorio": True, "condicional": True, "repetible": True},
        {"id": "HV-010", "section": "experiencia", "name": "Experiencia docente universitaria", "soporte": "Certificación de docencia", "obligatorio": False, "condicional": True, "repetible": True},
        {"id": "HV-011", "section": "experiencia", "name": "Experiencia investigativa", "soporte": "Certificación o acta de proyecto", "obligatorio": False, "repetible": True},
        {"id": "HV-012", "section": "licencias", "name": "Tarjeta profesional", "soporte": "Copia o certificado de vigencia", "obligatorio": False, "condicional": True},
        {"id": "HV-013", "section": "licencias", "name": "Otra licencia o acreditación técnica", "soporte": "Licencia o certificado vigente", "obligatorio": False, "condicional": True},
        {"id": "HV-014", "section": "formacion_complementaria", "name": "Curso, diplomado o seminario", "soporte": "Certificado o constancia", "obligatorio": False, "repetible": True},
        {"id": "HV-015", "section": "idiomas", "name": "Dominio de idiomas", "soporte": "Certificación de idioma", "obligatorio": False, "condicional": True, "repetible": True},
        {"id": "HV-016", "section": "competencias", "name": "Competencias técnicas y digitales", "soporte": "Certificado o evidencia opcional", "obligatorio": False, "repetible": True},
        {"id": "HV-017", "section": "produccion_academica", "name": "Publicación o artículo científico", "soporte": "Documento, DOI o enlace verificable", "obligatorio": False, "repetible": True},
        {"id": "HV-018", "section": "produccion_academica", "name": "Proyecto o producto de investigación", "soporte": "Certificación o producto", "obligatorio": False, "repetible": True},
        {"id": "HV-019", "section": "reconocimientos", "name": "Premio o distinción académica/profesional", "soporte": "Certificado o acto de reconocimiento", "obligatorio": False, "repetible": True},
        {"id": "HV-020", "section": "referencias", "name": "Referencia laboral o profesional", "soporte": "Sin soporte inicial", "obligatorio": False, "condicional": True, "repetible": True},
        {"id": "HV-021", "section": "disponibilidad", "name": "Disponibilidad para vinculación", "soporte": "Declaración en formulario", "obligatorio": True},
        {"id": "HV-022", "section": "declaraciones", "name": "Declaración juramentada de veracidad", "soporte": "Aceptación electrónica obligatoria", "obligatorio": True},
        {"id": "HV-023", "section": "especifico", "name": "Requisito adicional de convocatoria", "soporte": "Soporte configurado por Talento Humano", "obligatorio": False, "condicional": True},
        {"id": "HV-024", "section": "seguridad_social", "name": "Afiliación a seguridad social (EPS, Pensión)", "soporte": "Certificado EPS y Fondo de Pensiones", "obligatorio": False, "condicional": True},
        {"id": "HV-025", "section": "informacion_bancaria", "name": "Cuenta bancaria para vinculación (Davivienda)", "soporte": "Certificación bancaria de cuenta nómina", "obligatorio": False, "condicional": True},
        {"id": "HV-026", "section": "antecedentes", "name": "Verificación de antecedentes legales (Policía, Procuraduría, Contraloría, RNMC)", "soporte": "Certificaciones oficiales", "obligatorio": False, "condicional": True},
    ]

    return {
        "facultades": [
            "Facultad de Educación y Ciencias Sociales",
            "Facultad de Ingeniería",
            "Facultad de Ciencias Administrativas, Contables y Económicas",
            "Facultad de Derecho y Ciencias Políticas",
        ],
        "programas": [
            "Licenciatura en Educación Infantil",
            "Licenciatura en Literatura y Lengua Castellana",
            "Ingeniería de Sistemas",
            "Ingeniería Industrial",
            "Administración de Empresas",
            "Contaduría Pública",
            "Derecho",
            "Psicología",
            "Trabajo Social",
        ],
        "sedes": [
            "Sede Principal Sincelejo",
            "Sede Montería",
            "Centro Tutorial Caucasia",
            "Centro Tutorial Lorica",
        ],
        "periodos": ["2026-1", "2026-2", "2027-1"],
        "etapas": [
            {"key": "borrador", "label": "Borrador", "desc": "El candidato está diligenciando la postulación."},
            {"key": "enviada", "label": "Enviada", "desc": "Postulación confirmada dentro del plazo oficial."},
            {"key": "en_revision", "label": "En revisión", "desc": "Talento Humano verifica datos y soportes."},
            {"key": "subsanacion_requerida", "label": "Subsanación requerida", "desc": "El candidato debe corregir ítems observados."},
            {"key": "habilitada", "label": "Habilitada", "desc": "Cumple requisitos documentales mínimos."},
            {"key": "preseleccionada", "label": "Preseleccionada", "desc": "Autorizada para programación de entrevistas."},
            {"key": "entrevistada", "label": "Entrevistada", "desc": "Entrevistas y pruebas realizadas y evaluadas."},
            {"key": "seleccionada", "label": "Seleccionada", "desc": "Talento Humano registró la selección final."},
            {"key": "no_seleccionada", "label": "No seleccionada", "desc": "No continúa con causal registrada."},
            {"key": "examen_ocupacional", "label": "Examen Ocupacional", "desc": "Fase 2: Evaluación médica de ingreso."},
            {"key": "en_contratacion", "label": "En Contratación", "desc": "Fase 2: Expediente de formalización de contrato."},
            {"key": "vinculada", "label": "Vinculada", "desc": "Fase 2: Colaborador formalizado con código activo."},
            {"key": "retirada", "label": "Retirada", "desc": "El candidato desistió voluntariamente."},
        ],
        "causales_descarte": [
            {"id": cr.id, "code": cr.code, "name": cr.name, "description": cr.description}
            for cr in discard_reasons
        ],
        "tipos_items_hv": tipos_items_hv,
    }


# ==============================================================================
# HOJA DE VIDA POR ÍTEMS INDEPENDIENTES Y SOPORTES (RF-014 a RF-042, HV-001 a HV-026)
# ==============================================================================

@app.get("/api/applications/my")
def get_my_applications(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    apps = (
        db.scalars(
            select(Application)
            .options(
                joinedload(Application.vacancy),
                joinedload(Application.items).joinedload(ApplicationItem.supports),
                joinedload(Application.interviews),
                joinedload(Application.subsanaciones),
            )
            .where(Application.candidate_id == user.id)
            .order_by(Application.created_at.desc())
        )
        .unique()
        .all()
    )

    items_data = []
    for app in apps:
        # Calcular completitud de ítems
        total_items = len(app.items)
        approved_items = sum(1 for it in app.items if it.status == "aprobado")
        observed_items = sum(1 for it in app.items if it.status == "observado")
        supports_count = sum(len(it.supports) for it in app.items)

        # Entrevista activa si existe
        active_interview = None
        for intr in app.interviews:
            if intr.status in ("programada", "confirmada", "reprogramacion_solicitada"):
                active_interview = {
                    "id": intr.id,
                    "scheduledAt": intr.scheduled_at.isoformat(),
                    "modality": intr.modality,
                    "locationOrLink": intr.location_or_link,
                    "status": intr.status,
                }
                break

        # Subsanación pendiente si existe
        active_subsanacion = None
        for subs in app.subsanaciones:
            if subs.status == "pendiente":
                active_subsanacion = {
                    "id": subs.id,
                    "deadline": subs.deadline.isoformat(),
                    "requestedAt": subs.requested_at.isoformat(),
                    "generalNote": subs.general_note,
                }
                break

        items_data.append({
            "id": app.id,
            "vacancyId": app.vacancy_id,
            "vacancyCode": getattr(app.vacancy, "code", "CONV-2026"),
            "vacancyTitle": app.vacancy.title if app.vacancy else "Sin título",
            "faculty": getattr(app.vacancy, "faculty", "Facultad de Educación y Ciencias Sociales"),
            "status": app.status,
            "documentStatus": getattr(app, "document_status", "pendiente"),
            "version": getattr(app, "version", 1),
            "submittedAt": app.submitted_at.isoformat() if getattr(app, "submitted_at", None) else None,
            "subsanacionDeadline": app.subsanacion_deadline.isoformat() if getattr(app, "subsanacion_deadline", None) else None,
            "totalItems": total_items,
            "approvedItems": approved_items,
            "observedItems": observed_items,
            "supportsCount": supports_count,
            "activeInterview": active_interview,
            "activeSubsanacion": active_subsanacion,
            "talentBankConsent": getattr(app, "talent_bank_consent", False),
            "createdAt": app.created_at.isoformat(),
        })

    return {"items": items_data, "applications": items_data}


@app.post("/api/applications/draft", status_code=201)
def create_or_get_draft_application(
    payload: DraftApplicationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    vacancy = db.get(Vacancy, payload.vacancy_id)
    if not vacancy:
        raise HTTPException(status_code=404, detail="La convocatoria no existe.")
    if vacancy.status not in ("active", "draft"):
        raise HTTPException(status_code=400, detail="Esta convocatoria se encuentra cerrada.")

    # Regla RN-001: Máximo una postulación activa por convocatoria
    existing = db.scalar(
        select(Application)
        .where(
            Application.candidate_id == user.id,
            Application.vacancy_id == vacancy.id,
            Application.status != "retirada",
        )
        .limit(1)
    )
    if existing:
        return {"applicationId": existing.id, "status": existing.status, "isNew": False}

    if not payload.privacy_consent:
        raise HTTPException(status_code=422, detail="Debes aceptar el tratamiento de datos para iniciar la postulación.")

    # Crear borrador
    app = Application(
        id=str(uuid4()),
        vacancy_id=vacancy.id,
        candidate_id=user.id,
        name=user.name,
        phone=user.phone or "",
        location=user.location or "",
        status="borrador",
        document_status="pendiente",
        version=1,
        privacy_consent_at=utc_now(),
        privacy_consent_version=PRIVACY_CONSENT_VERSION,
        assigned_recruiter_id=vacancy.recruiter_id,
    )
    db.add(app)
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=user.id,
            event_type="status",
            to_status="borrador",
            note="Inicio de postulación en borrador.",
        )
    )
    db.commit()

    return {"applicationId": app.id, "status": "borrador", "isNew": True}


@app.get("/api/applications/{application_id}/dossier")
def get_application_dossier(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    app = db.scalar(
        select(Application)
        .options(
            joinedload(Application.vacancy),
            joinedload(Application.candidate),
            joinedload(Application.items).joinedload(ApplicationItem.supports),
            joinedload(Application.items).joinedload(ApplicationItem.reviews),
            joinedload(Application.interviews).joinedload(Interview.evaluations),
            joinedload(Application.subsanaciones),
            joinedload(Application.classroom_test),
            joinedload(Application.occupational_exam),
            joinedload(Application.hiring_dossier),
            joinedload(Application.activities),
        )
        .where(Application.id == application_id)
    )
    if not app:
        raise HTTPException(status_code=404, detail="Expediente no encontrado.")

    is_owner = app.candidate_id == viewer.id
    is_staff = viewer.role in (Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER, Role.INTERVIEWER, Role.ACADEMIC_LEAD)
    if not (is_owner or is_staff):
        raise HTTPException(status_code=403, detail="No tienes autorización para consultar este expediente.")

    # Formatear ítems por sección
    items_by_section: dict[str, list] = {}
    for item in app.items:
        try:
            parsed_data = json.loads(item.data_json) if item.data_json else {}
        except Exception:
            parsed_data = {}

        supports_list = [
            {
                "id": s.id,
                "originalName": s.original_name,
                "mediaType": s.media_type,
                "size": s.size,
                "viewUrl": f"/api/items/{item.id}/supports/{s.id}/view",
                "downloadUrl": f"/api/items/{item.id}/supports/{s.id}/download",
                "createdAt": s.created_at.isoformat(),
            }
            for s in item.supports
        ]

        # Solo staff ve las notas internas de revisión
        reviews_list = [
            {
                "result": r.result,
                "reason": r.reason,
                "observation": r.observation if is_staff else (r.reason or ""),
                "reviewedAt": r.reviewed_at.isoformat(),
            }
            for r in item.reviews
        ]

        item_dto = {
            "id": item.id,
            "itemType": item.item_type,
            "section": item.section,
            "title": item.title,
            "data": parsed_data,
            "status": item.status,
            "reviewerNote": item.reviewer_note if (is_owner or is_staff) else "",
            "isSubsanacion": item.is_subsanacion,
            "version": item.version,
            "supports": supports_list,
            "reviews": reviews_list,
            "createdAt": item.created_at.isoformat(),
        }
        items_by_section.setdefault(item.section, []).append(item_dto)

    activities_dto = [
        {
            "id": act.id,
            "type": act.event_type,
            "fromStatus": act.from_status,
            "toStatus": act.to_status,
            "note": act.note if (not act.is_internal or is_staff) else "Actualización del proceso",
            "author": act.author.name if act.author else "Sistema",
            "createdAt": act.created_at.isoformat(),
            "isInternal": act.is_internal,
        }
        for act in app.activities
        if not act.is_internal or is_staff
    ]

    return {
        "id": app.id,
        "candidate": {
            "id": app.candidate.id,
            "name": app.name,
            "email": app.candidate.email,
            "phone": app.phone,
            "location": app.location,
        },
        "vacancy": {
            "id": app.vacancy.id,
            "code": getattr(app.vacancy, "code", "CONV-2026"),
            "title": app.vacancy.title,
            "faculty": getattr(app.vacancy, "faculty", "Facultad de Educación y Ciencias Sociales"),
            "program": getattr(app.vacancy, "program", "Licenciatura en Educación Infantil"),
            "campus": getattr(app.vacancy, "campus", "Sede Principal Sincelejo"),
            "academicPeriod": getattr(app.vacancy, "academic_period", "2026-2"),
            "status": app.vacancy.status,
        },
        "status": app.status,
        "documentStatus": getattr(app, "document_status", "pendiente"),
        "version": getattr(app, "version", 1),
        "submittedAt": app.submitted_at.isoformat() if getattr(app, "submitted_at", None) else None,
        "subsanacionDeadline": app.subsanacion_deadline.isoformat() if getattr(app, "subsanacion_deadline", None) else None,
        "finalDecision": getattr(app, "final_decision", None),
        "finalDecisionNote": getattr(app, "final_decision_note", None),
        "talentBankConsent": getattr(app, "talent_bank_consent", False),
        "itemsBySection": items_by_section,
        "activities": activities_dto,
        "aiScore": app.ai_score,
        "aiVerdict": app.ai_verdict,
        "aiSummary": app.ai_summary,
    }


@app.post("/api/applications/{application_id}/items", status_code=201)
def add_application_item(
    application_id: str,
    payload: ItemCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")
    if app.candidate_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="No puedes modificar esta postulación.")

    # Control de estados de edición: solo borrador o subsanación
    if app.status not in ("borrador", "subsanacion_requerida"):
        raise HTTPException(
            status_code=403,
            detail="La postulación ya fue enviada y se encuentra en revisión. No se admiten modificaciones salvo solicitud de subsanación.",
        )

    item = ApplicationItem(
        id=str(uuid4()),
        application_id=app.id,
        item_type=payload.item_type,
        section=payload.section,
        title=payload.title.strip(),
        data_json=json.dumps(payload.data),
        status="pendiente",
        is_subsanacion=(app.status == "subsanacion_requerida"),
        version=getattr(app, "version", 1),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "title": item.title, "status": item.status}


@app.put("/api/applications/{application_id}/items/{item_id}")
def update_application_item(
    application_id: str,
    item_id: str,
    payload: ItemUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    item = db.get(ApplicationItem, item_id)
    if not app or not item or item.application_id != app.id:
        raise HTTPException(status_code=404, detail="Ítem no encontrado en esta postulación.")
    if app.candidate_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar este registro.")

    # Regla RN-011 / RF-049: En subsanación, SOLO se pueden modificar los ítems observados
    if app.status == "subsanacion_requerida":
        if item.status != "observado":
            raise HTTPException(
                status_code=403,
                detail="Durante la subsanación únicamente puedes corregir los ítems que fueron expresamente observados por Talento Humano.",
            )
    elif app.status != "borrador":
        raise HTTPException(status_code=403, detail="El expediente está bloqueado para modificaciones.")

    if payload.title is not None and payload.title.strip():
        item.title = payload.title.strip()
    if payload.data is not None:
        item.data_json = json.dumps(payload.data)
    item.updated_at = utc_now()
    db.commit()
    return {"id": item.id, "status": item.status, "message": "Ítem actualizado con éxito."}


@app.delete("/api/applications/{application_id}/items/{item_id}", status_code=204)
def delete_application_item(
    application_id: str,
    item_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    item = db.get(ApplicationItem, item_id)
    if not app or not item or item.application_id != app.id:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")
    if app.candidate_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="No puedes eliminar este ítem.")
    if app.status != "borrador":
        raise HTTPException(status_code=403, detail="No se pueden eliminar ítems después del envío de la postulación.")

    for s in item.supports:
        (UPLOAD_DIR / s.storage_name).unlink(missing_ok=True)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@app.post("/api/applications/{application_id}/items/{item_id}/support", status_code=201)
def upload_item_support(
    application_id: str,
    item_id: str,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    item = db.get(ApplicationItem, item_id)
    if not app or not item or item.application_id != app.id:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")
    if app.candidate_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="No puedes adjuntar soportes a esta postulación.")

    # En subsanación solo se permite en ítems observados
    if app.status == "subsanacion_requerida" and item.status != "observado":
        raise HTTPException(status_code=403, detail="Solo se pueden adjuntar soportes en ítems observados.")
    elif app.status not in ("borrador", "subsanacion_requerida"):
        raise HTTPException(status_code=403, detail="La postulación está bloqueada para carga de archivos.")

    path, storage_name, media_type, size, content_bytes = save_upload(file)
    support = ItemSupport(
        id=str(uuid4()),
        item_id=item.id,
        original_name=file.filename or "soporte.pdf",
        storage_name=storage_name,
        media_type=media_type,
        size=size,
        file_data=content_bytes,
        version=getattr(item, "version", 1),
    )
    db.add(support)
    db.commit()
    return {
        "id": support.id,
        "name": support.original_name,
        "size": support.size,
        "viewUrl": f"/api/items/{item.id}/supports/{support.id}/view",
    }


@app.get("/api/items/{item_id}/supports/{support_id}/view")
def view_item_support(
    item_id: str,
    support_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    support = db.get(ItemSupport, support_id)
    if not support or support.item_id != item_id:
        raise HTTPException(status_code=404, detail="Soporte no encontrado.")

    item = support.item
    app = item.application
    is_owner = app.candidate_id == viewer.id
    is_staff = viewer.role in (Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER, Role.INTERVIEWER, Role.ACADEMIC_LEAD)
    if not (is_owner or is_staff):
        raise HTTPException(status_code=403, detail="Acceso denegado a este soporte documental.")

    path = UPLOAD_DIR / support.storage_name
    if not path.is_file() or path.stat().st_size == 0:
        if support.file_data:
            path.write_bytes(support.file_data)
        else:
            fallback = generate_fallback_pdf(app.name, app.candidate.email, support.original_name)
            return Response(content=fallback, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={quote(support.original_name)}"})

    return FileResponse(
        path,
        media_type=support.media_type,
        headers={"Content-Disposition": f"inline; filename={quote(support.original_name)}"},
    )


@app.get("/api/items/{item_id}/supports/{support_id}/download")
def download_item_support(
    item_id: str,
    support_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    support = db.get(ItemSupport, support_id)
    if not support or support.item_id != item_id:
        raise HTTPException(status_code=404, detail="Soporte no encontrado.")

    item = support.item
    app = item.application
    is_owner = app.candidate_id == viewer.id
    is_staff = viewer.role in (Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER, Role.INTERVIEWER)
    if not (is_owner or is_staff):
        raise HTTPException(status_code=403, detail="Acceso denegado.")

    path = UPLOAD_DIR / support.storage_name
    if not path.is_file() or path.stat().st_size == 0:
        if support.file_data:
            path.write_bytes(support.file_data)
        else:
            fallback = generate_fallback_pdf(app.name, app.candidate.email, support.original_name)
            return Response(content=fallback, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={quote(support.original_name)}"})

    return FileResponse(
        path,
        media_type=support.media_type,
        headers={"Content-Disposition": f"attachment; filename={quote(support.original_name)}"},
    )


@app.post("/api/applications/{application_id}/submit")
def submit_application(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    if not app or app.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")
    if app.status != "borrador":
        raise HTTPException(status_code=400, detail="Esta postulación ya fue enviada previamente.")

    # Regla RN-003: Cierre automático si expiró la convocatoria
    vacancy = app.vacancy
    if vacancy.closing_date:
        cd = vacancy.closing_date if vacancy.closing_date.tzinfo else vacancy.closing_date.replace(tzinfo=timezone.utc)
        if cd < utc_now():
            raise HTTPException(status_code=400, detail="El plazo de postulación para esta convocatoria ha finalizado.")

    # Validación de secciones mínimas obligatorias (RF-038, RN-008)
    sections = {it.section for it in app.items}
    # Formación o Experiencia obligatoria
    if not ("formacion" in sections or "experiencia" in sections):
        raise HTTPException(
            status_code=422,
            detail="Debes registrar al menos un estudio o experiencia laboral con su respectivo soporte antes del envío.",
        )

    # Validar que los ítems con soporte obligatorio tengan archivo
    items_without_support = []
    for it in app.items:
        if it.section in ("formacion", "experiencia") and not it.supports:
            items_without_support.append(it.title)
    if items_without_support:
        raise HTTPException(
            status_code=422,
            detail=f"Falta adjuntar el archivo de soporte en: {', '.join(items_without_support[:3])}.",
        )

    app.status = "enviada"
    app.submitted_at = utc_now()
    app.document_status = "pendiente"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=user.id,
            event_type="status",
            from_status="borrador",
            to_status="enviada",
            note="Envío definitivo de la postulación y bloqueo de modificaciones ordinarias.",
        )
    )
    db.commit()

    notify_user(
        user.email,
        "Postulación confirmada en CECAR",
        f"Tu postulación a la convocatoria {vacancy.title} ha sido enviada con éxito. Puedes consultar tu constancia en el portal.",
    )

    return {
        "message": "¡Postulación enviada exitosamente! Tu expediente ingresó a la bandeja de revisión.",
        "applicationId": app.id,
        "status": "enviada",
        "submittedAt": app.submitted_at.isoformat(),
    }


@app.get("/api/applications/{application_id}/constancia")
def get_application_constancia(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    app = db.scalar(
        select(Application)
        .options(
            joinedload(Application.vacancy),
            joinedload(Application.candidate),
            joinedload(Application.items).joinedload(ApplicationItem.supports),
        )
        .where(Application.id == application_id)
    )
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")
    if app.candidate_id != viewer.id and viewer.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Acceso denegado a esta constancia.")

    # Generar constancia en HTML imprimible / PDF
    submitted_str = app.submitted_at.strftime("%d/%m/%Y %H:%M:%S") if app.submitted_at else "Pendiente"
    vacancy_code = getattr(app.vacancy, "code", "CONV-2026")
    vacancy_title = app.vacancy.title if app.vacancy else "Sin título"
    faculty = getattr(app.vacancy, "faculty", "Facultad de Educación y Ciencias Sociales")
    program = getattr(app.vacancy, "program", "Licenciatura en Educación Infantil")
    campus = getattr(app.vacancy, "campus", "Sede Principal Sincelejo")

    items_rows = ""
    for idx, it in enumerate(app.items, start=1):
        sup_names = ", ".join(s.original_name for s in it.supports) or "Sin soporte adjunto"
        items_rows += f"""
        <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">{idx}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600;">{escape(it.title)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">{escape(it.section.capitalize())}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">{escape(sup_names)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #166534; font-weight: 700;">Recibido</td>
        </tr>
        """

    constancia_html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Constancia de Postulación | CECAR - {escape(app.name)}</title>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #0f172a; line-height: 1.5; }}
        .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #15803d; padding-bottom: 18px; margin-bottom: 24px; }}
        .logo-title {{ font-size: 20px; font-weight: 800; color: #15803d; text-transform: uppercase; }}
        .badge {{ background: #dcfce7; color: #15803d; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px; }}
        .info-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 28px; }}
        .info-row {{ font-size: 13.5px; }}
        .info-row b {{ color: #334155; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 14px; }}
        th {{ background: #f1f5f9; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }}
        .seal {{ display: inline-block; border: 2px dashed #15803d; color: #15803d; padding: 10px 20px; border-radius: 6px; font-weight: 800; font-size: 13px; margin-top: 24px; }}
        @media print {{ body {{ margin: 20mm; }} }}
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="logo-title">Corporación Universitaria del Caribe - CECAR</div>
            <div style="font-size: 13px; color: #64748b; font-weight: 600;">Dirección de Talento Humano · Sistema Institucional de Selección</div>
        </div>
        <span class="badge">RADICADO OFICIAL: {app.id[:8].upper()}</span>
    </div>

    <h2 style="font-size: 18px; color: #1e293b; margin-top: 0;">CONSTANCIA FORMAL DE POSTULACIÓN A CONVOCATORIA</h2>
    <p style="font-size: 13.5px; color: #475569;">
        Se certifica que el siguiente aspirante ha registrado y enviado oportunamente su hoja de vida y soportes documentales a través de la plataforma institucional.
    </p>

    <div class="info-grid">
        <div class="info-row"><span>Aspirante:</span> <b>{escape(app.name)}</b></div>
        <div class="info-row"><span>Correo de contacto:</span> <b>{escape(app.candidate.email)}</b></div>
        <div class="info-row"><span>Convocatoria:</span> <b>{escape(vacancy_code)} · {escape(vacancy_title)}</b></div>
        <div class="info-row"><span>Dependencia / Facultad:</span> <b>{escape(faculty)}</b></div>
        <div class="info-row"><span>Programa académico:</span> <b>{escape(program)}</b></div>
        <div class="info-row"><span>Sede institucional:</span> <b>{escape(campus)}</b></div>
        <div class="info-row"><span>Fecha y hora oficial de envío:</span> <b>{submitted_str}</b></div>
        <div class="info-row"><span>Versión del expediente:</span> <b>v{getattr(app, 'version', 1)}</b></div>
    </div>

    <h3 style="font-size: 15px; color: #0f172a; margin-bottom: 6px;">Relación de Ítems y Soportes Documentales Recibidos ({len(app.items)} registros)</h3>
    <table>
        <thead>
            <tr>
                <th style="width: 30px;">#</th>
                <th>Ítem Declarado</th>
                <th>Sección</th>
                <th>Archivo Soporte</th>
                <th>Estado</th>
            </tr>
        </thead>
        <tbody>
            {items_rows or '<tr><td colspan="5" style="text-align:center; padding:16px;">Sin registros</td></tr>'}
        </tbody>
    </table>

    <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div class="seal">
            ✓ REGISTRO VALIDADO ELECTRÓNICAMENTE POR CECAR
        </div>
        <button onclick="window.print()" style="padding: 9px 18px; background: #15803d; color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">
            Imprimir / Guardar en PDF
        </button>
    </div>

    <div class="footer">
        Corporación Universitaria del Caribe - CECAR · Carretera Troncal de Occidente Km 1 Vía Corozal · Sincelejo, Colombia.<br>
        Documento generado automáticamente por el Sistema Integral de Selección y Gestión de Talento.
    </div>
</body>
</html>
    """
    return Response(content=constancia_html, media_type="text/html")


@app.post("/api/applications/{application_id}/retirar")
def candidate_withdraw_application(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    if not app or app.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")
    if app.status in ("seleccionada", "vinculada", "retirada"):
        raise HTTPException(status_code=400, detail="No es posible retirar la postulación en su etapa actual.")

    app.status = "retirada"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=user.id,
            event_type="status",
            to_status="retirada",
            note="El candidato desistió y retiró voluntariamente su postulación.",
        )
    )
    db.commit()

    return {"message": "Has retirado tu postulación exitosamente.", "status": "retirada"}


# ==============================================================================
# REVISIÓN DOCUMENTAL Y SUBSANACIONES (RF-043 a RF-053, RF-094, RF-095)
# ==============================================================================

@app.get("/api/applications/review-board")
def get_review_board(
    request: Request,
    vacancy_id: str = "",
    faculty: str = "",
    status_filter: str = "",
    document_status: str = "",
    query_search: str = "",
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER)

    stmt = (
        select(Application)
        .options(
            joinedload(Application.vacancy),
            joinedload(Application.candidate),
            joinedload(Application.items).joinedload(ApplicationItem.supports),
        )
        .where(Application.status != "borrador")
    )

    if vacancy_id.strip():
        stmt = stmt.where(Application.vacancy_id == vacancy_id.strip())
    if status_filter.strip():
        stmt = stmt.where(Application.status == status_filter.strip())
    if document_status.strip():
        stmt = stmt.where(Application.document_status == document_status.strip())

    apps = db.scalars(stmt.order_by(Application.created_at.desc())).unique().all()

    # Métricas consolidadas
    total_users = len({a.candidate_id for a in apps})
    total_docs = sum(len(it.supports) for a in apps for it in a.items)
    approved_docs = sum(1 for a in apps for it in a.items if it.status == "aprobado")
    in_review_docs = sum(1 for a in apps for it in a.items if it.status == "pendiente")
    rejected_docs = sum(1 for a in apps for it in a.items if it.status == "rechazado")
    subsanados_docs = sum(1 for a in apps for it in a.items if it.is_subsanacion)

    rows = []
    for a in apps:
        cand_name = a.name
        cand_email = a.candidate.email if a.candidate else ""
        vac_title = a.vacancy.title if a.vacancy else "Sin convocatoria"
        fac_name = getattr(a.vacancy, "faculty", "Facultad de Educación y Ciencias Sociales")

        if query_search.strip():
            qs = query_search.strip().lower()
            if qs not in cand_name.lower() and qs not in cand_email.lower() and qs not in vac_title.lower():
                continue

        if faculty.strip() and faculty.strip().lower() not in fac_name.lower():
            continue

        cargados_count = len(a.items)
        aprobados_count = sum(1 for it in a.items if it.status == "aprobado")
        pendientes_count = sum(1 for it in a.items if it.status == "pendiente")
        rechazados_count = sum(1 for it in a.items if it.status == "rechazado")

        rows.append({
            "id": a.id,
            "candidateName": cand_name,
            "candidateEmail": cand_email,
            "vacancyId": a.vacancy_id,
            "vacancyTitle": vac_title,
            "faculty": fac_name,
            "status": a.status,
            "documentStatus": getattr(a, "document_status", "pendiente"),
            "cargadosCount": cargados_count,
            "aprobadosCount": aprobados_count,
            "pendientesCount": pendientes_count,
            "rechazadosCount": rechazados_count,
            "version": getattr(a, "version", 1),
            "submittedAt": a.submitted_at.isoformat() if getattr(a, "submitted_at", None) else a.created_at.isoformat(),
        })

    return {
        "metrics": {
            "totalUsers": total_users,
            "totalDocs": total_docs,
            "approvedCount": approved_docs,
            "inReviewCount": in_review_docs,
            "rejectedCount": rejected_docs,
            "subsanadosCount": subsanados_docs,
        },
        "rows": rows,
    }


@app.post("/api/applications/{application_id}/items/{item_id}/review")
def review_application_item(
    application_id: str,
    item_id: str,
    payload: ItemReviewRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER)

    item = db.get(ApplicationItem, item_id)
    if not item or item.application_id != application_id:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")

    # Exigir motivo claro si se observa o rechaza (RN-010, RF-047)
    if payload.result in ("observado", "rechazado") and not (payload.reason and payload.reason.strip()):
        raise HTTPException(
            status_code=422,
            detail="Debes especificar un motivo claro para observar o rechazar el documento.",
        )

    item.status = payload.result
    item.reviewer_note = payload.reason
    item.updated_at = utc_now()

    # Guardar en historial de revisión (RF-052)
    review = ItemReview(
        id=str(uuid4()),
        item_id=item.id,
        reviewer_id=viewer.id,
        result=payload.result,
        reason=payload.reason,
        observation=payload.observation,
        reviewed_at=utc_now(),
    )
    db.add(review)

    # Recalcular estado documental consolidado (RF-053)
    app = item.application
    app.document_status = recalculate_document_status(app, db)
    db.commit()

    return {
        "itemId": item.id,
        "status": item.status,
        "documentStatus": app.document_status,
        "message": f"Documento marcado como {item.status}.",
    }


@app.post("/api/applications/{application_id}/subsanacion/request")
def request_subsanacion(
    application_id: str,
    payload: SubsanacionCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    observed_items = db.scalars(
        select(ApplicationItem)
        .where(ApplicationItem.application_id == app.id, ApplicationItem.status == "observado")
    ).all()

    if not observed_items:
        raise HTTPException(
            status_code=400,
            detail="No hay ítems marcados como observados en este expediente para solicitar subsanación.",
        )

    deadline = utc_now() + timedelta(days=payload.days)
    app.status = "subsanacion_requerida"
    app.subsanacion_deadline = deadline

    obs_summary = [
        {"id": it.id, "title": it.title, "section": it.section, "reason": it.reviewer_note or "Corregir soporte"}
        for it in observed_items
    ]

    subs = SubsanacionRequest(
        id=str(uuid4()),
        application_id=app.id,
        requested_by_id=viewer.id,
        status="pendiente",
        deadline=deadline,
        items_summary=json.dumps(obs_summary),
        general_note=payload.general_note,
        requested_at=utc_now(),
    )
    db.add(subs)

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="subsanacion",
            from_status=app.status,
            to_status="subsanacion_requerida",
            note=f"Solicitud de subsanación enviada con plazo hasta {deadline.strftime('%d/%m/%Y')}. Ítems: {len(observed_items)}.",
        )
    )
    db.commit()

    notify_user(
        app.candidate.email,
        "Acción requerida: Subsanación de documentos en CECAR",
        f"Se requiere subsanar {len(observed_items)} documento(s) de tu postulación a {app.vacancy.title}. Tienes plazo hasta el {deadline.strftime('%d/%m/%Y %H:%M')}.",
    )

    return {
        "message": f"Solicitud de subsanación generada con plazo de {payload.days} días.",
        "status": "subsanacion_requerida",
        "deadline": deadline.isoformat(),
        "observedCount": len(observed_items),
    }


@app.post("/api/applications/{application_id}/subsanacion/submit")
def submit_subsanacion(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    if not app or app.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")
    if app.status != "subsanacion_requerida":
        raise HTTPException(status_code=400, detail="Esta postulación no tiene subsanación pendiente.")

    # Control de plazo (RF-051)
    if app.subsanacion_deadline:
        dl = app.subsanacion_deadline if app.subsanacion_deadline.tzinfo else app.subsanacion_deadline.replace(tzinfo=timezone.utc)
        if dl < utc_now():
            raise HTTPException(status_code=400, detail="El plazo concedido para subsanar los documentos ha vencido.")

    # Incrementar versión y volver a poner en revisión
    app.version = getattr(app, "version", 1) + 1
    app.status = "en_revision"

    # Cerrar solicitud de subsanación activa
    active_subs = db.scalars(
        select(SubsanacionRequest)
        .where(SubsanacionRequest.application_id == app.id, SubsanacionRequest.status == "pendiente")
    ).all()
    for s in active_subs:
        s.status = "respondida"
        s.responded_at = utc_now()

    # Reabrir ítems observados a pendiente de revisión
    observed_items = db.scalars(
        select(ApplicationItem)
        .where(ApplicationItem.application_id == app.id, ApplicationItem.status == "observado")
    ).all()
    for it in observed_items:
        it.status = "pendiente"

    app.document_status = "pendiente"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=user.id,
            event_type="subsanacion",
            from_status="subsanacion_requerida",
            to_status="en_revision",
            note=f"Subsanación enviada por el aspirante (Versión {app.version}). Expediente devuelto a revisión.",
        )
    )
    db.commit()

    return {
        "message": "Subsanación radicada con éxito. El expediente vuelve a revisión por Talento Humano.",
        "status": "en_revision",
        "version": app.version,
    }


# ==============================================================================
# EVALUACIÓN, PRESELECCIÓN Y DESCARTE (RF-054 a RF-058, RF-093, RN-024)
# ==============================================================================

@app.post("/api/applications/{application_id}/preselect")
def preselect_candidate(
    application_id: str,
    payload: PreselectRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    # Regla RN-012: Habilitación exige expediente conforme salvo excepción documentada
    if getattr(app, "document_status", "pendiente") != "conforme":
        if not payload.justification:
            raise HTTPException(
                status_code=400,
                detail="Solo un expediente documentalmente 'Conforme' puede ser preseleccionado, o debe registrarse una justificación de excepción formal.",
            )

    app.status = "preseleccionada"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="preseleccion",
            to_status="preseleccionada",
            note=f"Candidato preseleccionado para entrevista. Fundamento: {payload.justification}",
        )
    )
    db.commit()

    notify_user(
        app.candidate.email,
        "¡Has sido preseleccionado en CECAR!",
        f"Tu postulación a {app.vacancy.title} ha superado la etapa documental y has sido preseleccionado para la fase de entrevistas.",
    )

    return {"message": "Candidato preseleccionado exitosamente.", "status": "preseleccionada"}


@app.post("/api/applications/{application_id}/discard")
def discard_candidate(
    application_id: str,
    payload: DiscardRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    # Regla RN-024 / RF-093: Causal de descarte obligatoria de catálogo
    reason = db.get(DiscardReason, payload.discard_reason_id)
    if not reason:
        raise HTTPException(status_code=422, detail="Debes seleccionar una causal válida del catálogo oficial de descarte.")

    previous_status = app.status
    app.status = "no_seleccionada"
    app.discard_reason_id = reason.id
    app.discard_note = payload.note
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="descarte",
            from_status=previous_status,
            to_status="no_seleccionada",
            note=f"Postulación descartada. Causal: {reason.name}. Detalle: {payload.note}",
        )
    )
    db.commit()

    # Mensaje externo neutral para el aspirante (RN-019)
    notify_user(
        app.candidate.email,
        "Actualización sobre tu proceso de selección en CECAR",
        f"Agradecemos tu participación en la convocatoria para {app.vacancy.title}. En esta ocasión hemos decidido continuar el proceso con otros perfiles que se ajustan más estrechamente a los requerimientos de la vacante.",
    )

    return {
        "message": "Candidato descartado con causal registrada en auditoría.",
        "status": "no_seleccionada",
        "discardReason": reason.name,
    }


@app.post("/api/applications/{application_id}/internal-note")
def add_internal_note(
    application_id: str,
    payload: InternalNoteRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER, Role.INTERVIEWER)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="nota_interna",
            note=payload.note,
            is_internal=True,
        )
    )
    db.commit()

    return {"message": "Nota interna registrada (no visible para el aspirante)."}


# ==============================================================================
# ENTREVISTAS, PRUEBAS Y DOCENCIA (RF-060 a RF-072, RF-087 a RF-090)
# ==============================================================================

@app.get("/api/interviews/slots")
def list_interview_slots(vacancy_id: str = "", db: Session = Depends(get_db)):
    stmt = select(InterviewSlot).where(InterviewSlot.is_available == True)
    if vacancy_id.strip():
        stmt = stmt.where(InterviewSlot.vacancy_id == vacancy_id.strip())
    slots = db.scalars(stmt.order_by(InterviewSlot.start_time.asc())).all()
    return {
        "slots": [
            {
                "id": sl.id,
                "vacancyId": sl.vacancy_id,
                "startTime": sl.start_time.isoformat(),
                "endTime": sl.end_time.isoformat(),
                "modality": sl.modality,
                "locationOrLink": sl.location_or_link,
            }
            for sl in slots
        ]
    }


@app.post("/api/interviews/slots", status_code=201)
def create_interview_slot(
    payload: InterviewSlotCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)

    slot = InterviewSlot(
        id=str(uuid4()),
        vacancy_id=payload.vacancy_id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        modality=payload.modality,
        location_or_link=payload.location_or_link,
        max_capacity=payload.max_capacity,
    )
    db.add(slot)
    db.commit()
    return {"id": slot.id, "startTime": slot.start_time.isoformat()}


@app.post("/api/interviews/schedule", status_code=201)
def schedule_candidate_interview(
    application_id: str,
    payload: InterviewScheduleRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    # Regla RN-016: Preselección previa obligatoria para entrevistar
    if app.status not in ("preseleccionada", "habilitada", "en_revision"):
        raise HTTPException(
            status_code=400,
            detail="Solo un candidato preseleccionado o habilitado puede ser programado para entrevista.",
        )

    # Regla RN-017 / RF-064: Evitar conflictos de horario
    start = payload.scheduled_at
    end = start + timedelta(minutes=payload.duration_minutes)

    conflict = db.scalar(
        select(Interview.id)
        .where(
            Interview.application_id == app.id,
            Interview.status.in_(("programada", "confirmada")),
            Interview.scheduled_at < end,
            Interview.scheduled_at + timedelta(minutes=45) > start,
        )
        .limit(1)
    )
    if conflict:
        raise HTTPException(status_code=409, detail="El candidato ya tiene una entrevista programada en ese horario.")

    interview = Interview(
        id=str(uuid4()),
        application_id=app.id,
        slot_id=payload.slot_id,
        scheduled_at=start,
        duration_minutes=payload.duration_minutes,
        modality=payload.modality,
        location_or_link=payload.location_or_link,
        status="programada",
    )
    db.add(interview)
    app.status = "entrevista"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="entrevista",
            to_status="entrevista",
            note=f"Entrevista programada para el {start.strftime('%d/%m/%Y %H:%M')}. Modalidad: {payload.modality}.",
        )
    )
    db.commit()

    link_info = f" Enlace: {payload.location_or_link}" if payload.location_or_link else ""
    notify_user(
        app.candidate.email,
        "Citación a Entrevista - CECAR",
        f"Has sido citado a entrevista para la convocatoria {app.vacancy.title}. Fecha: {start.strftime('%d/%m/%Y %H:%M')}. Modalidad: {payload.modality}.{link_info}. Por favor ingresa a tu portal para confirmar tu asistencia.",
    )

    return {
        "interviewId": interview.id,
        "scheduledAt": interview.scheduled_at.isoformat(),
        "status": "programada",
    }


@app.post("/api/interviews/{interview_id}/respond")
def respond_interview(
    interview_id: str,
    payload: InterviewRespondRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    interview = db.get(Interview, interview_id)
    if not interview or interview.application.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Entrevista no encontrada.")

    if payload.action == "confirmar":
        interview.status = "confirmada"
        interview.candidate_notes = "Asistencia confirmada por el aspirante."
        msg = "Asistencia confirmada."
    else:
        interview.status = "reprogramacion_solicitada"
        interview.candidate_notes = f"Reprogramación solicitada: {payload.reason or 'Sin motivo'}"
        msg = "Solicitud de reprogramación registrada para evaluación de Talento Humano."

    db.commit()
    db.add(
        ApplicationActivity(
            application_id=interview.application_id,
            author_id=user.id,
            event_type="entrevista",
            note=f"Respuesta a citación: {interview.status}. {interview.candidate_notes or ''}",
        )
    )
    db.commit()

    return {"message": msg, "status": interview.status}


@app.post("/api/interviews/{interview_id}/evaluate")
def evaluate_interview(
    interview_id: str,
    payload: InterviewEvaluationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.INTERVIEWER)

    interview = db.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Entrevista no encontrada.")

    # Evaluación individual (RF-070, RN-018)
    evaluation = InterviewEvaluation(
        id=str(uuid4()),
        interview_id=interview.id,
        evaluator_id=viewer.id,
        scores_json=json.dumps(payload.criteria_scores),
        total_score=payload.total_score,
        concept=payload.concept,
        notes=payload.notes,
        is_consolidated=False,
    )
    db.add(evaluation)
    interview.status = "realizada"
    interview.application.status = "entrevistada"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=interview.application_id,
            author_id=viewer.id,
            event_type="evaluacion_entrevista",
            note=f"Evaluación de entrevista registrada por {viewer.name}. Puntaje: {payload.total_score}/100. Concepto: {payload.concept}.",
            is_internal=True,
        )
    )
    db.commit()

    return {"evaluationId": evaluation.id, "totalScore": evaluation.total_score, "concept": evaluation.concept}


@app.get("/api/interviews/{interview_id}/report")
def get_interview_report(
    interview_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.INTERVIEWER)

    interview = db.scalar(
        select(Interview)
        .options(
            joinedload(Interview.application).joinedload(Application.candidate),
            joinedload(Interview.application).joinedload(Application.vacancy),
            joinedload(Interview.evaluations).joinedload(InterviewEvaluation.evaluator),
        )
        .where(Interview.id == interview_id)
    )
    if not interview:
        raise HTTPException(status_code=404, detail="Entrevista no encontrada.")

    evals = [
        {
            "evaluator": ev.evaluator.name if ev.evaluator else "Comité",
            "score": ev.total_score,
            "concept": ev.concept,
            "notes": ev.notes,
            "submittedAt": ev.submitted_at.isoformat(),
        }
        for ev in interview.evaluations
    ]
    avg_score = sum(ev.total_score for ev in interview.evaluations) / max(1, len(interview.evaluations))

    return {
        "candidateName": interview.application.name,
        "vacancyTitle": interview.application.vacancy.title,
        "scheduledAt": interview.scheduled_at.isoformat(),
        "modality": interview.modality,
        "evaluationsCount": len(evals),
        "averageScore": round(avg_score, 1),
        "evaluations": evals,
    }


@app.post("/api/applications/{application_id}/tests", status_code=201)
def add_application_test(
    application_id: str,
    payload: TestResultCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.ACADEMIC_LEAD)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    test = TestResult(
        id=str(uuid4()),
        application_id=app.id,
        test_type=payload.test_type,
        name=payload.name,
        score=payload.score,
        passed=payload.passed,
        notes=payload.notes,
        evaluated_by_id=viewer.id,
    )
    db.add(test)
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="prueba",
            note=f"Prueba {payload.test_type.capitalize()} '{payload.name}' registrada. Calificación: {payload.score}/100 ({'Aprobada' if payload.passed else 'No aprobada'}).",
            is_internal=True,
        )
    )
    db.commit()

    return {"id": test.id, "score": test.score, "passed": test.passed}


@app.post("/api/applications/{application_id}/classroom-test", status_code=201)
def add_classroom_test(
    application_id: str,
    payload: ClassroomTestCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.ACADEMIC_LEAD)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    ct = ClassroomTest(
        id=str(uuid4()),
        application_id=app.id,
        topic=payload.topic,
        rubric_json=json.dumps(payload.rubric),
        score=payload.score,
        passed=payload.passed,
        notes=payload.notes,
        evaluator_id=viewer.id,
    )
    db.add(ct)
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="prueba_aula",
            note=f"Prueba de aula docente registrada por Desarrollo Profesoral. Tema: '{payload.topic}'. Puntaje: {payload.score}/100.",
            is_internal=True,
        )
    )
    db.commit()

    return {"id": ct.id, "score": ct.score, "passed": ct.passed}


# ==============================================================================
# DECISIÓN FINAL, BANCO DE TALENTO Y CIERRE (RF-073 a RF-076, RN-015, RN-021)
# ==============================================================================

class FinalDecisionRequest(BaseModel):
    result: Literal["seleccionada", "no_seleccionada", "elegible"]
    fundamento: str = Field(min_length=5, max_length=1500)


@app.post("/api/applications/{application_id}/decision")
def record_final_decision(
    application_id: str,
    payload: FinalDecisionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.TALENTO_HUMANO)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    app.final_decision = payload.result
    app.final_decision_note = payload.fundamento
    app.final_decision_date = utc_now()
    app.status = payload.result
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="decision_final",
            to_status=payload.result,
            note=f"Decisión final oficial registrada: {payload.result.capitalize()}. Fundamento: {payload.fundamento}",
        )
    )
    db.commit()

    notify_user(
        app.candidate.email,
        "Decisión final sobre tu proceso de selección en CECAR",
        f"Tu postulación a {app.vacancy.title} ha concluido con la decisión: {payload.result.upper()}. Consulta los detalles en el portal.",
    )

    return {"message": "Decisión final registrada con éxito.", "status": app.status}


class TalentBankConsentRequest(BaseModel):
    consent: bool


@app.post("/api/applications/{application_id}/talent-bank-consent")
def talent_bank_consent(
    application_id: str,
    payload: TalentBankConsentRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    app = db.get(Application, application_id)
    if not app or app.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    app.talent_bank_consent = payload.consent
    app.talent_bank_consent_at = utc_now() if payload.consent else None
    db.commit()

    return {
        "message": "Consentimiento de Banco de Talento actualizado con éxito.",
        "talentBankConsent": app.talent_bank_consent,
    }


# ==============================================================================
# FASE 2: SALUD OCUPACIONAL, CONTRATACIÓN, VINCULACIÓN E INTEGRACIÓN (RF-101 a RF-106)
# ==============================================================================

@app.post("/api/applications/{application_id}/occupational-exam")
def record_occupational_exam(
    application_id: str,
    payload: OccupationalExamRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.TALENTO_HUMANO, Role.OCCUPATIONAL_HEALTH)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    exam = db.scalar(select(OccupationalExam).where(OccupationalExam.application_id == app.id))
    if not exam:
        exam = OccupationalExam(
            id=str(uuid4()),
            application_id=app.id,
            provider=payload.provider,
            fitness_concept=payload.fitness_concept,
            restrictions=payload.restrictions,
            evaluated_at=utc_now(),
        )
        db.add(exam)
    else:
        exam.provider = payload.provider
        exam.fitness_concept = payload.fitness_concept
        exam.restrictions = payload.restrictions
        exam.evaluated_at = utc_now()

    app.status = "examen_ocupacional"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="examen_ocupacional",
            to_status="examen_ocupacional",
            note=f"Concepto de aptitud ocupacional: {payload.fitness_concept.upper()}. Proveedor: {payload.provider}.",
            is_internal=True,
        )
    )
    db.commit()

    return {"message": "Concepto médico ocupacional registrado.", "concept": exam.fitness_concept}


@app.get("/api/applications/{application_id}/hiring-dossier")
def get_hiring_dossier(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    dossier = db.scalar(select(HiringDossier).where(HiringDossier.application_id == app.id))
    binding = db.scalar(select(EmploymentBinding).where(EmploymentBinding.application_id == app.id))

    return {
        "applicationId": app.id,
        "candidateName": app.name,
        "status": dossier.status if dossier else "pendiente",
        "contractType": dossier.contract_type if dossier else "Cátedra Universitaria",
        "checklist": json.loads(dossier.checklist_json) if dossier and dossier.checklist_json else {
            "minuta_contrato": True,
            "cedula_150": True,
            "hoja_vida_funcion_publica": True,
            "titulos_actas": True,
            "seguridad_social_eps": True,
            "cuenta_davivienda": True,
            "examen_ingreso": True,
            "antecedentes_judiciales": True,
        },
        "formalizationDate": dossier.formalization_date.isoformat() if dossier and dossier.formalization_date else None,
        "binding": {
            "employeeCode": binding.employee_code,
            "startDate": binding.start_date.isoformat(),
            "status": binding.status,
        } if binding else None,
    }


@app.post("/api/applications/{application_id}/hiring-dossier")
def update_hiring_dossier(
    application_id: str,
    payload: HiringDossierRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.TALENTO_HUMANO)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    dossier = db.scalar(select(HiringDossier).where(HiringDossier.application_id == app.id))
    if not dossier:
        dossier = HiringDossier(
            id=str(uuid4()),
            application_id=app.id,
            status=payload.contract_status,
            checklist_json=json.dumps(payload.checklist),
            contract_type=payload.contract_type,
            responsible_id=viewer.id,
            notes=payload.notes,
        )
        db.add(dossier)
    else:
        dossier.status = payload.contract_status
        dossier.checklist_json = json.dumps(payload.checklist)
        dossier.contract_type = payload.contract_type
        dossier.responsible_id = viewer.id
        dossier.notes = payload.notes

    if payload.contract_status == "formalizado":
        dossier.formalization_date = utc_now()

    app.status = "en_contratacion"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="contratacion",
            to_status="en_contratacion",
            note=f"Expediente de contratación actualizado. Estado de firma: {payload.contract_status}.",
        )
    )
    db.commit()

    return {"message": "Expediente de contratación guardado.", "status": dossier.status}


@app.post("/api/applications/{application_id}/confirm-binding")
def confirm_employment_binding(
    application_id: str,
    payload: ConfirmBindingRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.TALENTO_HUMANO)

    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    dossier = db.scalar(select(HiringDossier).where(HiringDossier.application_id == app.id))
    if not dossier:
        dossier = HiringDossier(
            id=str(uuid4()),
            application_id=app.id,
            status="formalizado",
            formalization_date=utc_now(),
            responsible_id=viewer.id,
        )
        db.add(dossier)
        db.commit()

    # Confirmación formal de colaborador (RF-104, RN-025)
    binding = db.scalar(select(EmploymentBinding).where(EmploymentBinding.application_id == app.id))
    if not binding:
        binding = EmploymentBinding(
            id=str(uuid4()),
            hiring_id=dossier.id,
            application_id=app.id,
            employee_code=payload.employee_code.strip(),
            start_date=payload.start_date,
            status="vinculado",
            confirmed_by_id=viewer.id,
            confirmed_at=utc_now(),
        )
        db.add(binding)
    else:
        binding.employee_code = payload.employee_code.strip()
        binding.start_date = payload.start_date
        binding.confirmed_at = utc_now()

    app.status = "vinculada"
    dossier.status = "formalizado"
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="vinculacion",
            to_status="vinculada",
            note=f"Colaborador formalmente vinculado a CECAR. Código institucional: {binding.employee_code}. Fecha inicio: {payload.start_date.strftime('%d/%m/%Y')}.",
        )
    )
    db.commit()

    notify_user(
        app.candidate.email,
        "¡Bienvenido a CECAR! Vinculación laboral confirmada",
        f"Nos complace darte la bienvenida a nuestra institución. Tu código de colaborador es {binding.employee_code} y tu fecha oficial de inicio es {payload.start_date.strftime('%d/%m/%Y')}.",
    )

    return {
        "message": "Colaborador vinculado exitosamente en el sistema institucional.",
        "employeeCode": binding.employee_code,
        "status": "vinculada",
    }


@app.post("/api/applications/{application_id}/transfer-institutional-hv")
def transfer_to_institutional_hr(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.TALENTO_HUMANO)

    app = db.scalar(
        select(Application)
        .options(
            joinedload(Application.candidate),
            joinedload(Application.vacancy),
            joinedload(Application.items),
        )
        .where(Application.id == application_id)
    )
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    # Simulación y contrato de integración (RF-105, RF-106, RN-026)
    transfer_payload = {
        "aspiranteId": app.candidate_id,
        "documentoIdentidad": app.candidate.email,
        "nombres": app.name,
        "convocatoria": getattr(app.vacancy, "code", "CONV-2026"),
        "facultad": getattr(app.vacancy, "faculty", "Facultad de Educación y Ciencias Sociales"),
        "itemsAprobadosCount": len(app.items),
        "fechaTransferencia": utc_now().isoformat(),
    }

    log = InstitutionalIntegration(
        id=str(uuid4()),
        application_id=app.id,
        destination_system="Sistema Institucional Hoja de Vida CECAR (API Integrada)",
        status="transferido",
        attempts=1,
        payload_json=json.dumps(transfer_payload),
        transferred_at=utc_now(),
    )
    db.add(log)
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=app.id,
            author_id=viewer.id,
            event_type="integracion_hv",
            note="Datos y soportes aprobados transferidos exitosamente a la Hoja de Vida Institucional.",
            is_internal=True,
        )
    )
    db.commit()

    return {
        "message": "Transferencia de datos a Hoja de Vida Institucional completada exitosamente sin duplicación.",
        "integrationId": log.id,
        "status": "transferido",
    }


# ==============================================================================
# REPORTES Y ANÁLISIS INTEGRAL (RF-077 a RF-079, RF-086, RF-096 a RF-098)
# ==============================================================================

@app.get("/api/reports/indicators")
def get_indicators(request: Request, db: Session = Depends(get_db)):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)

    apps = db.scalars(select(Application)).all()
    total = len(apps)
    postulados = sum(1 for a in apps if a.status in ("enviada", "recibida"))
    en_proceso = sum(1 for a in apps if a.status in ("en_revision", "subsanacion_requerida", "habilitada", "preseleccionada", "entrevista", "entrevistada", "examen_ocupacional", "en_contratacion"))
    no_aprobados = sum(1 for a in apps if a.status in ("no_seleccionada", "no_continua", "rechazada", "retirada"))
    seleccionados = sum(1 for a in apps if a.status in ("seleccionada", "oferta"))
    vinculados = sum(1 for a in apps if a.status == "vinculada")

    items = db.scalars(select(ApplicationItem)).all()
    total_items = len(items)
    approved_items = sum(1 for it in items if it.status == "aprobado")
    doc_completion = round((approved_items / max(1, total_items)) * 100, 1)

    return {
        "totalApplications": total,
        "postulados": postulados,
        "enProceso": en_proceso,
        "noAprobados": no_aprobados,
        "seleccionados": seleccionados,
        "vinculados": vinculados,
        "documentCompletionRate": doc_completion,
    }


@app.get("/api/reports/specialized")
def get_specialized_report(
    report_type: Literal["no_aprobados", "en_proceso", "seleccionados"],
    request: Request,
    vacancy_id: str = "",
    faculty: str = "",
    campus: str = "",
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)

    stmt = select(Application).options(
        joinedload(Application.vacancy),
        joinedload(Application.candidate),
        joinedload(Application.assigned_recruiter),
    )

    if report_type == "no_aprobados":
        stmt = stmt.where(Application.status.in_(("no_seleccionada", "no_continua", "rechazada", "retirada")))
    elif report_type == "en_proceso":
        stmt = stmt.where(Application.status.in_(("enviada", "recibida", "en_revision", "subsanacion_requerida", "habilitada", "preseleccionada", "entrevista", "entrevistada", "examen_ocupacional", "en_contratacion")))
    elif report_type == "seleccionados":
        stmt = stmt.where(Application.status.in_(("seleccionada", "oferta", "vinculada")))

    if vacancy_id.strip():
        stmt = stmt.where(Application.vacancy_id == vacancy_id.strip())

    apps = db.scalars(stmt.order_by(Application.created_at.desc())).unique().all()

    results = []
    for a in apps:
        fac = getattr(a.vacancy, "faculty", "Facultad de Educación y Ciencias Sociales")
        camp = getattr(a.vacancy, "campus", "Sede Principal Sincelejo")

        if faculty.strip() and faculty.strip().lower() not in fac.lower():
            continue
        if campus.strip() and campus.strip().lower() not in camp.lower():
            continue

        item_dto = {
            "id": a.id,
            "candidateName": a.name,
            "candidateEmail": a.candidate.email if a.candidate else "",
            "vacancyCode": getattr(a.vacancy, "code", "CONV-2026"),
            "vacancyTitle": a.vacancy.title if a.vacancy else "Sin vacante",
            "faculty": fac,
            "campus": camp,
            "status": a.status,
            "stage": a.status.replace("_", " ").capitalize(),
            "appliedAt": a.created_at.strftime("%d/%m/%Y"),
            "assignedResponsible": a.assigned_recruiter.name if a.assigned_recruiter else "Talento Humano",
        }

        if report_type == "no_aprobados":
            item_dto["discardReason"] = a.discard_note or "No cumple requisitos mínimos del perfil"
            item_dto["discardCode"] = getattr(a, "discard_reason_id", "DES-GEN")
        elif report_type == "seleccionados":
            item_dto["formalizationStatus"] = "Vinculado con contrato" if a.status == "vinculada" else "En trámite de formalización"

        results.append(item_dto)

    return {"reportType": report_type, "count": len(results), "records": results}


@app.get("/api/reports/export")
def export_report_csv(
    report_type: Literal["no_aprobados", "en_proceso", "seleccionados"],
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.TALENTO_HUMANO, Role.RECRUITER)

    data = get_specialized_report(report_type=report_type, request=request, db=db)
    records = data.get("records", [])

    output = BytesIO()
    # Escribir CSV con encoding UTF-8 BOM para apertura perfecta en Excel
    output.write(b"\xef\xbb\xbf")
    headers = ["ID", "Aspirante", "Correo", "Convocatoria", "Facultad", "Sede", "Etapa", "Responsable", "Fecha"]
    if report_type == "no_aprobados":
        headers.append("Causal de Descarte")
    elif report_type == "seleccionados":
        headers.append("Estado de Formalización")

    csv_lines = [";".join(f'"{h}"' for h in headers)]
    for r in records:
        row = [
            r["id"][:8],
            r["candidateName"],
            r["candidateEmail"],
            f'{r["vacancyCode"]} - {r["vacancyTitle"]}',
            r["faculty"],
            r["campus"],
            r["stage"],
            r["assignedResponsible"],
            r["appliedAt"],
        ]
        if report_type == "no_aprobados":
            row.append(r.get("discardReason", ""))
        elif report_type == "seleccionados":
            row.append(r.get("formalizationStatus", ""))
        escaped_row = ['"' + str(val).replace('"', '""') + '"' for val in row]
        csv_lines.append(";".join(escaped_row))

    csv_content = b"\xef\xbb\xbf" + "\r\n".join(csv_lines).encode("utf-8")
    filename = f"reporte_cecar_{report_type}_{datetime.now().strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ==============================================================================
# MESA DE AYUDA Y PLAN DE TRABAJO (RF-091, RF-099)
# ==============================================================================

@app.get("/api/tickets")
def list_tickets(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    if user.role == Role.ADMIN or user.role in (Role.TALENTO_HUMANO, Role.RECRUITER):
        tickets = db.scalars(select(HelpTicket).options(joinedload(HelpTicket.user)).order_by(HelpTicket.created_at.desc())).all()
    else:
        tickets = db.scalars(select(HelpTicket).where(HelpTicket.user_id == user.id).order_by(HelpTicket.created_at.desc())).all()

    return {
        "tickets": [
            {
                "id": t.id,
                "category": t.category,
                "subject": t.subject,
                "message": t.message,
                "status": t.status,
                "response": t.response,
                "userName": t.user.name if t.user else "Usuario",
                "createdAt": t.created_at.strftime("%d/%m/%Y %H:%M"),
                "resolvedAt": t.resolved_at.strftime("%d/%m/%Y %H:%M") if t.resolved_at else None,
            }
            for t in tickets
        ]
    }


@app.post("/api/tickets", status_code=201)
def create_ticket(
    payload: HelpTicketCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)

    ticket = HelpTicket(
        id=str(uuid4()),
        user_id=user.id,
        category=payload.category,
        subject=payload.subject.strip(),
        message=payload.message.strip(),
        status="abierto",
    )
    db.add(ticket)
    db.commit()
    return {"id": ticket.id, "subject": ticket.subject, "status": ticket.status}


@app.post("/api/tickets/{ticket_id}/reply")
def reply_ticket(
    ticket_id: str,
    payload: HelpTicketReplyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.TALENTO_HUMANO, Role.RECRUITER)

    ticket = db.get(HelpTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")

    ticket.response = payload.response.strip()
    ticket.responded_by_id = viewer.id
    ticket.status = "resuelto"
    ticket.resolved_at = utc_now()
    db.commit()

    notify_user(
        ticket.user.email,
        f"Respuesta a tu solicitud: {ticket.subject}",
        f"Tu solicitud de soporte ha sido atendida por {viewer.name}:\n\n{ticket.response}",
    )

    return {"message": "Respuesta enviada y ticket resuelto.", "ticketId": ticket.id}


@app.get("/api/work-plan")
def get_work_plan(vacancy_id: str = "", db: Session = Depends(get_db)):
    stmt = select(SelectionWorkPlan)
    if vacancy_id.strip():
        stmt = stmt.where(SelectionWorkPlan.vacancy_id == vacancy_id.strip())
    plan = db.scalar(stmt.limit(1))

    default_activities = [
        {"id": "act-1", "title": "Publicación de convocatoria y apertura de postulaciones", "status": "completado", "responsible": "Talento Humano", "days": "Día 1 a 15"},
        {"id": "act-2", "title": "Verificación documental y recepción de soportes", "status": "en_progreso", "responsible": "Comisión Revisora", "days": "Día 16 a 20"},
        {"id": "act-3", "title": "Plazo de subsanación de documentos observados", "status": "pendiente", "responsible": "Aspirantes / TH", "days": "Día 21 a 25"},
        {"id": "act-4", "title": "Prueba de aula y evaluación por Desarrollo Profesoral", "status": "pendiente", "responsible": "Desarrollo Profesoral", "days": "Día 26 a 30"},
        {"id": "act-5", "title": "Entrevistas de panel y consolidación de puntajes", "status": "pendiente", "responsible": "Comité de Selección", "days": "Día 31 a 35"},
        {"id": "act-6", "title": "Exámenes ocupacionales de ingreso y contratación", "status": "pendiente", "responsible": "Salud Ocupacional / Jurídica", "days": "Día 36 a 40"},
    ]

    return {
        "status": plan.status if plan else "activo",
        "activities": json.loads(plan.activities_json) if plan and plan.activities_json else default_activities,
    }


# ==============================================================================
# RUTAS PREEXISTENTES MANTENIDAS (COMPATIBILIDAD 100%)
# ==============================================================================

@app.get("/api/applications/mine")
def my_applications(request: Request, db: Session = Depends(get_db)):
    return get_my_applications(request, db)


@app.get("/api/dashboard/summary")
def dashboard_summary(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    vacancies_count = db.scalar(select(func.count(Vacancy.id)).where(Vacancy.status == "active")) or 0
    applications_count = db.scalar(select(func.count(Application.id))) or 0
    active_recruiters = db.scalar(select(func.count(User.id)).where(User.role.in_((Role.RECRUITER, Role.TALENTO_HUMANO)))) or 0
    return {
        "activeVacancies": vacancies_count,
        "totalApplications": applications_count,
        "activeRecruiters": active_recruiters,
    }


@app.get("/api/users")
def list_users(
    request: Request,
    role: str = "",
    status_filter: str = "",
    location: str = "",
    query_search: str = "",
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)
    stmt = select(User).distinct()
    if role.strip():
        stmt = stmt.where(User.role == role.strip())
    if status_filter.strip():
        stmt = stmt.join(Application, Application.candidate_id == User.id).where(Application.status == status_filter.strip())
    if location.strip():
        stmt = stmt.where(or_(User.location == location.strip(), Application.location == location.strip()))
    if query_search.strip():
        qs = f"%{query_search.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(User.name).like(qs), func.lower(User.email).like(qs)))
    users = db.scalars(stmt.order_by(User.created_at.desc())).all()
    users_list = [user_data(u, db, viewer) for u in users]
    return {"items": users_list, "users": users_list, "total": len(users_list)}


@app.post("/api/users/{user_id}/promote-recruiter")
def promote_recruiter(user_id: str, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.role = Role.RECRUITER
    db.commit()
    return user_data(user, db, viewer)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: str, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if user.id == viewer.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta de administrador.")
    db.delete(user)
    db.commit()
    return Response(status_code=204)


@app.get("/api/vacancies")
def list_vacancies(
    request: Request,
    faculty: str = "",
    campus: str = "",
    status_filter: str = "",
    q: str = "",
    location: str = "",
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    stmt = select(Vacancy).options(joinedload(Vacancy.recruiter), joinedload(Vacancy.applications))
    if viewer.role == Role.RECRUITER:
        stmt = stmt.where(
            or_(
                Vacancy.recruiter_id == viewer.id,
                Vacancy.applications.any(Application.assigned_recruiter_id == viewer.id),
            )
        )
    if status_filter.strip():
        stmt = stmt.where(Vacancy.status == status_filter.strip())
    if q.strip():
        qs = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Vacancy.title).like(qs), func.lower(Vacancy.description).like(qs)))
    if location.strip():
        stmt = stmt.where(func.lower(Vacancy.location).like(f"%{location.strip().lower()}%"))

    vacancies = db.scalars(stmt.order_by(Vacancy.created_at.desc())).unique().all()
    
    result = []
    for v in vacancies:
        if faculty.strip() and faculty.strip().lower() not in getattr(v, "faculty", "").lower():
            continue
        if campus.strip() and campus.strip().lower() not in getattr(v, "campus", "").lower():
            continue
        result.append(vacancy_data(v, viewer))
    return {"items": result, "total": len(result)}


@app.post("/api/vacancies", status_code=201)
def create_vacancy(
    payload: VacancyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)

    recruiter_id = payload.recruiter_id
    if viewer.role == Role.RECRUITER:
        recruiter_id = viewer.id

    vacancy = Vacancy(
        id=str(uuid4()),
        code=payload.code or f"CONV-{datetime.now().year}-{secrets.token_hex(2).upper()}",
        title=payload.title.strip(),
        type=payload.type.strip(),
        location=payload.location.strip(),
        faculty=payload.faculty,
        program=payload.program,
        campus=payload.campus,
        academic_period=payload.academic_period,
        vacancies_count=payload.vacancies_count,
        modality=payload.modality,
        description=payload.description.strip(),
        status=payload.status,
        recruiter_id=recruiter_id,
    )
    db.add(vacancy)
    db.commit()
    db.refresh(vacancy)
    return vacancy_data(vacancy, viewer)


@app.delete("/api/vacancies/{vacancy_id}", status_code=204)
def delete_vacancy(vacancy_id: str, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN)
    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada.")
    db.delete(vacancy)
    db.commit()
    return Response(status_code=204)


@app.post("/api/documents", status_code=201)
def upload_document(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    path, storage_name, media_type, size, content_bytes = save_upload(file)
    document = Document(
        id=str(uuid4()),
        owner_id=user.id,
        original_name=file.filename or "cv.pdf",
        media_type=media_type,
        storage_name=storage_name,
        size=size,
        file_data=content_bytes,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return {
        "id": document.id,
        "name": document.original_name,
        "type": document.media_type,
        "size": document.size,
    }


@app.get("/api/documents/{document_id}")
def get_document_info(document_id: str, request: Request, db: Session = Depends(get_db)):
    viewer = current_user(request, db)
    doc = db.get(Document, document_id)
    if not doc or not can_access_document(viewer, doc, db):
        raise HTTPException(status_code=404, detail="Documento no encontrado o sin autorización.")
    return {
        "id": doc.id,
        "name": doc.original_name,
        "type": doc.media_type,
        "size": doc.size,
    }


@app.get("/api/documents/{document_id}/view")
def view_document(document_id: str, request: Request, db: Session = Depends(get_db)):
    viewer = current_user(request, db)
    doc = db.get(Document, document_id)
    if not doc or not can_access_document(viewer, doc, db):
        raise HTTPException(status_code=404, detail="Documento no encontrado.")

    path = UPLOAD_DIR / doc.storage_name
    if not path.is_file() or path.stat().st_size == 0:
        if doc.file_data:
            path.write_bytes(doc.file_data)
        else:
            fallback = generate_fallback_pdf(doc.owner.name, doc.owner.email, doc.original_name)
            return Response(content=fallback, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={quote(doc.original_name)}"})

    return FileResponse(
        path,
        media_type=doc.media_type,
        headers={"Content-Disposition": f"inline; filename={quote(doc.original_name)}"},
    )


@app.get("/api/documents/{document_id}/download")
def download_document(document_id: str, request: Request, db: Session = Depends(get_db)):
    viewer = current_user(request, db)
    doc = db.get(Document, document_id)
    if not doc or not can_access_document(viewer, doc, db):
        raise HTTPException(status_code=404, detail="Documento no encontrado.")

    path = UPLOAD_DIR / doc.storage_name
    if not path.is_file() or path.stat().st_size == 0:
        if doc.file_data:
            path.write_bytes(doc.file_data)
        else:
            fallback = generate_fallback_pdf(doc.owner.name, doc.owner.email, doc.original_name)
            return Response(content=fallback, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={quote(doc.original_name)}"})

    return FileResponse(
        path,
        media_type=doc.media_type,
        headers={"Content-Disposition": f"attachment; filename={quote(doc.original_name)}"},
    )


@app.post("/api/vacancies/{vacancy_id}/applications", status_code=201)
def apply_to_vacancy(
    vacancy_id: str,
    request: Request,
    name: str = Form(...),
    phone: str = Form(...),
    location: str = Form(...),
    privacy_consent: bool = Form(...),
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada.")
    if not privacy_consent:
        raise HTTPException(status_code=422, detail="Debes aceptar el aviso de privacidad.")

    existing = db.scalar(
        select(Application.id).where(Application.vacancy_id == vacancy.id, Application.candidate_id == user.id)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Ya te has postulado a esta convocatoria.")

    path, storage_name, media_type, size, content_bytes = save_upload(resume)
    document = Document(
        id=str(uuid4()),
        owner_id=user.id,
        original_name=resume.filename or "cv.pdf",
        media_type=media_type,
        storage_name=storage_name,
        size=size,
        file_data=content_bytes,
    )
    db.add(document)
    db.commit()

    application = Application(
        id=str(uuid4()),
        vacancy_id=vacancy.id,
        candidate_id=user.id,
        name=name.strip(),
        phone=phone.strip(),
        location=location.strip(),
        resume_id=document.id,
        status="recibida",
        document_status="pendiente",
        version=1,
        submitted_at=utc_now(),
        assigned_recruiter_id=vacancy.recruiter_id,
        privacy_consent_at=utc_now(),
        privacy_consent_version=PRIVACY_CONSENT_VERSION,
    )
    db.add(application)
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=application.id,
            author_id=user.id,
            event_type="status",
            to_status="recibida",
            note="Postulación registrada con documento principal.",
        )
    )
    db.commit()

    return {"message": "Postulación enviada.", "applicationId": application.id}


@app.get("/api/applications")
def list_all_applications(
    request: Request,
    vacancy_id: str = "",
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO, Role.REVIEWER)
    query = (
        select(Application)
        .options(
            joinedload(Application.vacancy).joinedload(Vacancy.recruiter),
            joinedload(Application.candidate),
            joinedload(Application.resume),
            joinedload(Application.assigned_recruiter),
            joinedload(Application.activities).joinedload(ApplicationActivity.author),
        )
    )
    if viewer.role == Role.RECRUITER:
        query = query.where(
            or_(
                Application.vacancy.has(Vacancy.recruiter_id == viewer.id),
                Application.assigned_recruiter_id == viewer.id,
            )
        )
    if vacancy_id.strip():
        query = query.where(Application.vacancy_id == vacancy_id.strip())

    applications = db.scalars(query.order_by(Application.created_at.desc())).unique().all()
    return {
        "items": [
            {
                "id": app_item.id,
                "vacancyId": app_item.vacancy_id,
                "vacancyTitle": app_item.vacancy.title if app_item.vacancy else "Sin vacante",
                "candidateId": app_item.candidate_id,
                "email": app_item.candidate.email if app_item.candidate else "",
                "name": app_item.name,
                "phone": app_item.phone,
                "location": app_item.location,
                "resumeId": app_item.resume_id,
                "resumeName": app_item.resume.original_name if app_item.resume else "",
                "aiScore": app_item.ai_score,
                "aiVerdict": app_item.ai_verdict,
                "aiSummary": app_item.ai_summary,
                "status": app_item.status,
                "documentStatus": getattr(app_item, "document_status", "pendiente"),
                "appliedAt": app_item.created_at.isoformat(),
                "assignedRecruiterId": app_item.assigned_recruiter_id,
                "assignedRecruiterName": app_item.assigned_recruiter.name if app_item.assigned_recruiter else None,
                "activities": [
                    {
                        "id": act.id,
                        "type": act.event_type,
                        "author": act.author.name if act.author else "Sistema",
                        "fromStatus": act.from_status,
                        "toStatus": act.to_status,
                        "note": act.note,
                        "createdAt": act.created_at.isoformat(),
                    }
                    for act in app_item.activities
                ],
            }
            for app_item in applications
        ]
    }


@app.patch("/api/applications/{application_id}")
def update_application(
    application_id: str,
    payload: ApplicationUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)
    application = db.scalar(
        select(Application)
        .options(
            joinedload(Application.vacancy).joinedload(Vacancy.recruiter),
            joinedload(Application.candidate),
        )
        .where(Application.id == application_id)
    )
    can_manage = application is not None and (
        viewer.role == Role.ADMIN
        or application.vacancy.recruiter_id == viewer.id
        or application.assigned_recruiter_id == viewer.id
        or viewer.role == Role.TALENTO_HUMANO
    )
    if not can_manage:
        raise HTTPException(status_code=404, detail="No se encontró una postulación asignada a tu equipo.")

    assignment_requested = "assigned_recruiter_id" in payload.model_fields_set
    if payload.status is None and payload.note is None and not assignment_requested:
        raise HTTPException(status_code=422, detail="Indica un cambio de etapa, responsable o nota.")

    previous_status = application.status
    previous_assignee = application.assigned_recruiter_id
    assignee = None

    if payload.status is not None:
        application.status = payload.status
    if assignment_requested and payload.assigned_recruiter_id:
        assignee = db.get(User, payload.assigned_recruiter_id)
        if not assignee or assignee.role not in (Role.RECRUITER, Role.TALENTO_HUMANO):
            raise HTTPException(status_code=422, detail="Selecciona un reclutador válido.")
        application.assigned_recruiter_id = assignee.id
    elif assignment_requested:
        application.assigned_recruiter_id = None

    note = payload.note.strip() if payload.note else None
    if note == "":
        note = None

    if payload.status is not None and payload.status != previous_status:
        db.add(
            ApplicationActivity(
                application_id=application.id,
                author_id=viewer.id,
                event_type="status",
                from_status=previous_status,
                to_status=application.status,
            )
        )
    if previous_assignee != application.assigned_recruiter_id:
        db.add(
            ApplicationActivity(
                application_id=application.id,
                author_id=viewer.id,
                event_type="assignment",
                note=(
                    f"Responsable asignado: {assignee.name}"
                    if assignee
                    else "Se retiró el responsable asignado."
                ),
            )
        )
    if note:
        db.add(
            ApplicationActivity(
                application_id=application.id,
                author_id=viewer.id,
                event_type="note",
                note=note,
            )
        )
    db.commit()

    status_changed = payload.status is not None and payload.status != previous_status
    email_sent = True
    if status_changed and application.candidate:
        email_sent = notify_user(
            application.candidate.email,
            "Actualización de tu postulación en RecruitPro",
            f"La etapa de tu postulación para {application.vacancy.title} cambió a: {payload.status.replace('_', ' ')}.",
        )
    return {
        "id": application.id,
        "status": application.status,
        "assignedRecruiterId": application.assigned_recruiter_id,
        "statusChanged": status_changed,
        "emailSent": email_sent,
    }


@app.delete("/api/applications/{application_id}", status_code=204)
def delete_application(application_id: str, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN)
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")
    db.delete(app)
    db.commit()
    return Response(status_code=204)


@app.get("/api/ai/analyze-application/{application_id}")
def analyze_application_ai(application_id: str, request: Request, db: Session = Depends(get_db)):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER, Role.TALENTO_HUMANO)
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")

    # Simulación inteligente ATS
    app.ai_score = 92
    app.ai_verdict = "Altamente Apto"
    app.ai_summary = "Perfil altamente coincidente con los requerimientos académicos e investigativos del cargo docente."
    app.ai_analyzed_at = utc_now()
    db.commit()

    return {
        "score": app.ai_score,
        "verdict": app.ai_verdict,
        "summary": app.ai_summary,
    }


@app.get("/api/public/vacancies")
def public_vacancies(db: Session = Depends(get_db)):
    vacancies = db.scalars(
        select(Vacancy)
        .where(Vacancy.status == "active")
        .order_by(Vacancy.created_at.desc())
    ).all()
    return {
        "items": [
            {
                "id": v.id,
                "code": getattr(v, "code", "CONV-2026"),
                "title": v.title,
                "type": v.type,
                "location": v.location,
                "faculty": getattr(v, "faculty", "Facultad de Educación y Ciencias Sociales"),
                "program": getattr(v, "program", "Licenciatura en Educación Infantil"),
                "campus": getattr(v, "campus", "Sede Principal Sincelejo"),
                "academicPeriod": getattr(v, "academic_period", "2026-2"),
                "description": v.description,
                "createdAt": v.created_at.isoformat(),
            }
            for v in vacancies
        ]
    }


@app.post("/api/public/apply", status_code=201)
def public_apply(
    vacancy_id: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    location: str = Form(...),
    privacy_consent: bool = Form(...),
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not privacy_consent:
        raise HTTPException(status_code=422, detail="Debes aceptar el tratamiento de datos personales.")
    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada.")

    clean_email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == clean_email))
    if not user:
        user = User(
            id=str(uuid4()),
            name=name.strip(),
            email=clean_email,
            password_hash=password_hash.hash(secrets.token_urlsafe(16)),
            role=Role.CANDIDATE,
            phone=phone.strip(),
            location=location.strip(),
            email_verified_at=utc_now(),
            privacy_consent_at=utc_now(),
            privacy_consent_version=PRIVACY_CONSENT_VERSION,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    path, storage_name, media_type, size, content_bytes = save_upload(resume)
    document = Document(
        id=str(uuid4()),
        owner_id=user.id,
        original_name=resume.filename or "cv.pdf",
        media_type=media_type,
        storage_name=storage_name,
        size=size,
        file_data=content_bytes,
    )
    db.add(document)
    db.commit()

    application = Application(
        id=str(uuid4()),
        vacancy_id=vacancy.id,
        candidate_id=user.id,
        name=name.strip(),
        phone=phone.strip(),
        location=location.strip(),
        resume_id=document.id,
        status="recibida",
        document_status="pendiente",
        version=1,
        submitted_at=utc_now(),
        assigned_recruiter_id=vacancy.recruiter_id,
        privacy_consent_at=utc_now(),
        privacy_consent_version=PRIVACY_CONSENT_VERSION,
    )
    db.add(application)
    db.commit()

    db.add(
        ApplicationActivity(
            application_id=application.id,
            author_id=user.id,
            event_type="status",
            to_status="recibida",
            note="Postulación pública recibida.",
        )
    )
    db.commit()

    return {
        "message": "¡Tu postulación ha sido recibida con éxito!",
        "applicationId": application.id,
    }


# ==============================================================================
# RUTAS DE PÁGINAS ESTÁTICAS Y FRONTEND
# ==============================================================================

@app.get("/empleos.html")
@app.get("/empleos")
def public_careers_page():
    return FileResponse(ROOT / "empleos.html")


@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/index.html", methods=["GET", "HEAD"])
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/registro.html")
def registration_page():
    return FileResponse(ROOT / "registro.html")


@app.get("/verificar.html")
def verify_page():
    return FileResponse(ROOT / "verificar.html")


@app.get("/restablecer.html")
def reset_page():
    return FileResponse(ROOT / "restablecer.html")


@app.get("/recuperar.html")
def recover_page():
    return FileResponse(ROOT / "recuperar.html")


@app.get("/privacidad.html")
def privacy_page():
    return FileResponse(ROOT / "privacidad.html")


@app.get("/dashboard.html")
def dashboard_page():
    return FileResponse(ROOT / "dashboard.html")


app.mount("/css", StaticFiles(directory=ROOT / "css"), name="css")
app.mount("/js", StaticFiles(directory=ROOT / "js"), name="js")
