import os
import shutil
import logging
import re
import secrets
import smtplib
import zipfile
from contextlib import asynccontextmanager
from html import escape
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
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
    AuthSession,
    Document,
    EmailToken,
    Role,
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
DATA_DIR = Path(os.getenv("DATA_DIR", str(ROOT.parent / "recruitpro-data"))).resolve()
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

APPLICATION_STATUSES = ("recibida", "en_revision", "entrevista", "oferta", "rechazada")
RETENTION_MONTHS = max(1, int(os.getenv("RETENTION_MONTHS", "24")))
ALLOWED_FILES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".doc": ("application/msword", bytes.fromhex("D0CF11E0A1B11AE1")),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b"PK\x03\x04",
    ),
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
        from .database import SessionLocal
        with SessionLocal() as db:
            admin_user = db.scalar(select(User).where(User.email == "luctapi89@gmail.com").limit(1))
            if not admin_user:
                db.add(User(
                    id="7c8ed709-87fc-404d-9dc3-e118d1f62191",
                    name="Lucas Tapia",
                    email="luctapi89@gmail.com",
                    password_hash="$argon2id$v=19$m=65536,t=3,p=4$dvtLAEUGZ96eW00Sc5pHMA$XMZ5CBcyF0c0DanwRCg6DConjnhetEAo56HEd9jgv/c",
                    role=Role.ADMIN,
                    email_verified_at=utc_now(),
                    last_activity_at=utc_now(),
                    privacy_consent_at=utc_now(),
                    privacy_consent_version=PRIVACY_CONSENT_VERSION,
                ))
                db.commit()
            if not db.scalar(select(Vacancy.id).limit(1)):
                db.add(Vacancy(
                    id="f77546e6-aa0f-4346-8b25-e83f644eb134",
                    title="Desarrollador Full Stack Senior",
                    type="Tiempo completo",
                    location="Remoto",
                    description="Buscamos un desarrollador full stack con experiencia en FastAPI y JavaScript.",
                    status="active",
                    recruiter_id="7c8ed709-87fc-404d-9dc3-e118d1f62191",
                ))
                db.add(Vacancy(
                    id="e928ec9d-4615-4dd3-ba17-81438fb5b0fd",
                    title="Líder de Arquitectura de Software & Backend",
                    type="Tiempo completo",
                    location="Remoto / Híbrido",
                    description="Posición de liderazgo técnico responsable del diseño, escalabilidad y resiliencia de la plataforma. Requisitos fundamentales: dominio avanzado en Python, FastAPI, microservicios, bases de datos relacionales PostgreSQL, contenedores Docker, orquestación con Kubernetes y despliegues en infraestructura AWS. Se valorará liderazgo técnico, metodologías ágiles y experiencia en optimización de rendimiento.",
                    status="active",
                    recruiter_id="7c8ed709-87fc-404d-9dc3-e118d1f62191",
                ))
                db.commit()
    except Exception as exc:
        logging.getLogger("recruitpro").warning("Startup seed notice: %s", exc)
    yield


app = FastAPI(title="RecruitPro API", version="1.0.0", lifespan=lifespan)
logger = logging.getLogger("recruitpro")


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    privacy_consent: bool


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class VacancyRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=60)
    location: str = Field(default="", max_length=100)
    description: str = Field(min_length=1, max_length=3000)
    recruiter_id: str | None = None
    status: str = "active"


class ProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=30)
    location: str = Field(default="", max_length=100)


class AdminUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)


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
    status: Literal["recibida", "en_revision", "entrevista", "oferta", "rechazada"] | None = None
    note: str | None = Field(default=None, max_length=2000)
    assigned_recruiter_id: str | None = None


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
    if not can_view_documents and viewer.role == Role.RECRUITER:
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
        "role": user.role.value,
        "phone": user.phone,
        "location": user.location,
        "emailVerified": user.email_verified_at is not None,
        "privacyConsentAt": (
            user.privacy_consent_at.isoformat() if user.privacy_consent_at else None
        ),
        "privacyConsentVersion": user.privacy_consent_version,
        "documents": documents,
    }


def vacancy_data(vacancy: Vacancy, viewer: User, *, include_page_details: bool = True) -> dict:
    recruiter = vacancy.recruiter
    can_manage_vacancy = viewer.role == Role.ADMIN or (
        viewer.role == Role.RECRUITER and vacancy.recruiter_id == viewer.id
    )
    visible_applications = vacancy.applications
    if viewer.role == Role.RECRUITER and not can_manage_vacancy:
        visible_applications = [
            item for item in vacancy.applications if item.assigned_recruiter_id == viewer.id
        ]
    can_see_applications = viewer.role == Role.ADMIN or (
        viewer.role == Role.RECRUITER and bool(visible_applications)
    )
    applications = []
    if can_see_applications:
        applications = [
            {
                "id": item.id,
                "email": item.candidate.email,
                "name": item.name,
                "phone": item.phone,
                "location": item.location,
                "resumeId": item.resume_id,
                "resumeName": item.resume.original_name,
                "aiScore": item.ai_score,
                "aiVerdict": item.ai_verdict,
                "appliedAt": item.created_at.isoformat(),
                "status": item.status,
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
    elif viewer.role == Role.CANDIDATE:
        applications = [
            {
                "email": viewer.email,
                "status": item.status,
                "appliedAt": item.created_at.isoformat(),
            }
            for item in visible_applications
            if item.candidate_id == viewer.id
        ]
    return {
        "id": vacancy.id,
        "title": vacancy.title,
        "type": vacancy.type,
        "location": vacancy.location,
        "description": vacancy.description,
        "status": vacancy.status,
        "recruiterId": recruiter.id if recruiter else "",
        "recruiterEmail": recruiter.email if recruiter else "",
        "recruiterName": recruiter.name if recruiter else "Administrador",
        "canManage": can_manage_vacancy,
        "createdAt": vacancy.created_at.isoformat(),
        "applications": applications if include_page_details else [],
    }


def save_upload(upload: UploadFile) -> tuple[Path, str, str, int]:
    suffix = Path(upload.filename or "").suffix.lower()
    file_type = ALLOWED_FILES.get(suffix)
    if not file_type:
        raise HTTPException(status_code=415, detail="Solo se permiten archivos PDF, DOC o DOCX.")
    content = upload.file.read(MAX_FILE_SIZE + 1)
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB.")
    media_type, signature = file_type
    if not content.startswith(signature):
        raise HTTPException(status_code=415, detail="El contenido no coincide con el formato del archivo.")
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(BytesIO(content)) as archive:
                if "word/document.xml" not in archive.namelist():
                    raise HTTPException(status_code=415, detail="El documento DOCX no es válido.")
        except zipfile.BadZipFile as error:
            raise HTTPException(status_code=415, detail="El documento DOCX no es válido.") from error

    storage_name = str(uuid4())
    target = UPLOAD_DIR / storage_name
    with target.open("xb") as output:
        output.write(content)
    return target, storage_name, media_type, len(content)


def get_document_or_404(db: Session, document_id: str) -> Document:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="No se encontró el documento.")
    return document


def can_read_document(db: Session, viewer: User, document: Document) -> bool:
    if viewer.role == Role.ADMIN or viewer.id == document.owner_id:
        return True
    if viewer.role != Role.RECRUITER:
        return False
    return db.scalar(
        select(Application.id)
        .join(Vacancy, Application.vacancy_id == Vacancy.id)
        .where(
            Application.candidate_id == document.owner_id,
            or_(
                Vacancy.recruiter_id == viewer.id,
                Application.assigned_recruiter_id == viewer.id,
            ),
        )
        .limit(1)
    ) is not None


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
    
    # Check if email is already registered
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
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as error:
        db.rollback()
        logger.exception("Error al registrar cuenta: %s", error)
        raise HTTPException(status_code=500, detail="Error interno al registrar la cuenta.") from error

    # Auto-login immediately upon registration (no email confirmation needed)
    create_session(response, db, user, request)
    return {
        "message": "¡Cuenta creada exitosamente! Redirigiendo...",
        "authenticated": True,
        "redirect": "dashboard.html",
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
    # Sin verificacion requerida: acceso inmediato
    user.last_activity_at = utc_now()
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
        base_url = os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
        notify_account_link(
            user.email,
            "Verifica tu correo de RecruitPro",
            "Confirma tu dirección de correo",
            "Usa el enlace para verificar tu correo y activar tu cuenta.",
            f"{base_url}/verificar.html?token={quote(token)}",
        )
    return {"message": "Si existe una cuenta pendiente para ese correo, recibirás un enlace de verificación."}


@app.post("/api/auth/password-reset", status_code=202)
def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    email = normalize_email(payload.email)
    user = db.scalar(
        select(User).where(User.email == email, User.email_verified_at.is_not(None))
    )
    if user:
        token = issue_email_token(db, user, "password_reset")
        base_url = os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
        notify_account_link(
            user.email,
            "Restablece tu contraseña de RecruitPro",
            "Solicitud para restablecer la contraseña",
            "El enlace para crear una nueva contraseña vence en una hora.",
            f"{base_url}/restablecer.html?token={quote(token)}",
        )
    return {"message": "Si la cuenta existe y está verificada, recibirás instrucciones por correo."}


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    email_token = consume_email_token(db, payload.token, "password_reset")
    email_token.user.password_hash = password_hash.hash(payload.new_password)
    db.query(AuthSession).filter(AuthSession.user_id == email_token.user_id).delete(
        synchronize_session=False
    )
    db.delete(email_token)
    db.commit()
    return {"message": "Contraseña actualizada. Inicia sesión con tu nueva contraseña."}


@app.patch("/api/auth/profile")
def update_own_profile(
    payload: ProfileRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    user.name = payload.name.strip()
    user.phone = payload.phone.strip() or None
    user.location = payload.location.strip() or None
    user.last_activity_at = utc_now()
    db.commit()
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
    db.query(AuthSession).filter(
        AuthSession.user_id == user.id,
        AuthSession.token_hash != hash_token(request.cookies[SESSION_COOKIE]),
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Contraseña actualizada. Las otras sesiones se cerraron."}


@app.delete("/api/auth/account", status_code=204)
def delete_own_account(
    payload: DeleteAccountRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    user = current_user(request, db)
    if user.role != Role.CANDIDATE:
        raise HTTPException(
            status_code=403,
            detail="Solicita al administrador la eliminación de una cuenta de equipo.",
        )
    if not password_hash.verify(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    applications = db.scalars(
        select(Application).where(Application.candidate_id == user.id)
    ).all()
    document_ids = {
        document.id
        for document in db.scalars(select(Document).where(Document.owner_id == user.id)).all()
    }
    document_ids.update(application.resume_id for application in applications)
    documents = (
        db.scalars(select(Document).where(Document.id.in_(document_ids))).all()
        if document_ids
        else []
    )
    paths = [UPLOAD_DIR / document.storage_name for document in documents]
    for application in applications:
        db.delete(application)
    db.flush()
    for document in documents:
        db.delete(document)
    db.delete(user)
    db.commit()
    clear_session(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("No se pudo eliminar un documento de una cuenta eliminada: %s", path)
    return response


@app.get("/api/privacy")
def privacy_information(request: Request, db: Session = Depends(get_db)):
    return {
        "version": PRIVACY_CONSENT_VERSION,
        "retentionMonths": RETENTION_MONTHS,
        "notice": (
            "RecruitPro utiliza tus datos de perfil y documentos para gestionar "
            "tus postulaciones y procesos de selección. Tus CV solo se comparten "
            "con el administrador y los reclutadores responsables de vacantes a "
            "las que te postulaste. Las cuentas de candidato, sus postulaciones y "
            f"documentos se eliminan tras {RETENTION_MONTHS} meses de inactividad, "
            "sujeto a las obligaciones legales aplicables. La jurisdicción y el texto legal definitivo deben "
            "confirmarse antes de producción."
        ),
    }


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    verify_csrf(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        if session:
            db.delete(session)
            db.commit()
    clear_session(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@app.get("/api/applications/mine")
def list_my_applications(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.CANDIDATE)
    query = (
        select(Application)
        .options(joinedload(Application.vacancy), joinedload(Application.assigned_recruiter))
        .where(Application.candidate_id == viewer.id)
    )
    total = db.scalar(
        select(func.count(Application.id)).where(Application.candidate_id == viewer.id)
    ) or 0
    applications = db.scalars(
        query.order_by(Application.created_at.desc(), Application.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [
            {
                "id": item.id,
                "vacancyId": item.vacancy_id,
                "vacancyTitle": item.vacancy.title,
                "status": item.status,
                "createdAt": item.created_at.isoformat(),
            }
            for item in applications
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/dashboard/summary")
def dashboard_summary(request: Request, db: Session = Depends(get_db)):
    viewer = current_user(request, db)
    vacancy_query = select(func.count(Vacancy.id))
    if viewer.role == Role.RECRUITER:
        vacancy_query = vacancy_query.where(Vacancy.recruiter_id == viewer.id)
    if viewer.role == Role.CANDIDATE:
        vacancy_count = db.scalar(select(func.count(Vacancy.id)).where(Vacancy.status == "active")) or 0
        application_count = db.scalar(
            select(func.count(Application.id)).where(Application.candidate_id == viewer.id)
        ) or 0
        return {"vacancies": vacancy_count, "applications": application_count}
    if viewer.role == Role.RECRUITER:
        return {
            "vacancies": db.scalar(vacancy_query) or 0,
            "applications": db.scalar(
                select(func.count(Application.id))
                .join(Vacancy)
                .where(Vacancy.recruiter_id == viewer.id)
            ) or 0,
        }
    return {
        "users": db.scalar(select(func.count(User.id))) or 0,
        "candidates": db.scalar(select(func.count(User.id)).where(User.role == Role.CANDIDATE)) or 0,
        "recruiters": db.scalar(select(func.count(User.id)).where(User.role == Role.RECRUITER)) or 0,
        "vacancies": db.scalar(select(func.count(Vacancy.id))) or 0,
    }


@app.get("/api/users")
def list_users(
    request: Request,
    role: str,
    q: str = "",
    location: str = "",
    status_filter: str = "",
    vacancy_id: str = "",
    sort: Literal["name", "created_at"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    if role == Role.CANDIDATE.value:
        require_role(viewer, Role.ADMIN, Role.RECRUITER)
    elif role == Role.RECRUITER.value:
        require_role(viewer, Role.ADMIN)
    else:
        raise HTTPException(status_code=400, detail="Filtro de usuarios no válido.")
    query = select(User).where(
        User.role == Role(role),
        User.email_verified_at.is_not(None),
    )
    count_query = select(func.count(func.distinct(User.id))).where(
        User.role == Role(role),
        User.email_verified_at.is_not(None),
    )
    if viewer.role == Role.RECRUITER:
        application_scope = (
            select(Application.candidate_id)
            .join(Vacancy, Application.vacancy_id == Vacancy.id)
            .where(
                or_(
                    Vacancy.recruiter_id == viewer.id,
                    Application.assigned_recruiter_id == viewer.id,
                )
            )
        )
        query = query.where(User.id.in_(application_scope))
        count_query = count_query.where(User.id.in_(application_scope))
    if q.strip():
        term = f"%{q.strip()}%"
        search_filter = or_(User.name.ilike(term), User.email.ilike(term))
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    if location.strip():
        location_filter = User.location.ilike(f"%{location.strip()}%")
        query = query.where(location_filter)
        count_query = count_query.where(location_filter)
    application_filters = []
    if status_filter:
        if status_filter not in APPLICATION_STATUSES:
            raise HTTPException(status_code=400, detail="Etapa de postulación no válida.")
        application_filters.append(Application.status == status_filter)
    if vacancy_id:
        application_filters.append(Application.vacancy_id == vacancy_id)
    if application_filters:
        applications_for_user = (
            select(Application.candidate_id)
            .join(Vacancy, Application.vacancy_id == Vacancy.id)
            .where(*application_filters)
        )
        if viewer.role == Role.RECRUITER:
            applications_for_user = applications_for_user.where(
                or_(
                    Vacancy.recruiter_id == viewer.id,
                    Application.assigned_recruiter_id == viewer.id,
                )
            )
        query = query.where(User.id.in_(applications_for_user))
        count_query = count_query.where(User.id.in_(applications_for_user))
    count = db.scalar(count_query) or 0
    ordering_column = User.name if sort == "name" else User.created_at
    ordering = ordering_column.asc() if order == "asc" else ordering_column.desc()
    accounts = db.scalars(
        query.options(joinedload(User.documents))
        .order_by(ordering, User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return {
        "items": [user_data(account, db, viewer) for account in accounts],
        "total": count,
        "page": page,
        "page_size": page_size,
    }


@app.patch("/api/users/{user_id}")
def update_user(user_id: str, payload: AdminUserRequest, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN)
    account = db.get(User, user_id)
    if not account or account.role not in (Role.CANDIDATE, Role.RECRUITER):
        raise HTTPException(status_code=404, detail="No se encontró un perfil editable.")
    new_email = normalize_email(payload.email)
    changed_email = account.email != new_email
    account.name = payload.name.strip()
    account.email = new_email
    if changed_email:
        account.email_verified_at = None
        db.query(AuthSession).filter(AuthSession.user_id == account.id).delete(
            synchronize_session=False
        )
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo.") from error
    email_sent = True
    if changed_email:
        token = issue_email_token(db, account, "verify_email")
        base_url = os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
        email_sent = notify_account_link(
            account.email,
            "Verifica tu correo de RecruitPro",
            "Confirma tu nueva dirección de correo",
            "Un administrador actualizó tu correo. Verifícalo para volver a iniciar sesión.",
            f"{base_url}/verificar.html?token={quote(token)}",
        )
    return {**user_data(account, db, viewer), "emailSent": email_sent}


@app.post("/api/users/{user_id}/promote-recruiter")
def promote_recruiter(user_id: str, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN)
    account = db.get(User, user_id)
    if not account or account.role != Role.CANDIDATE:
        raise HTTPException(status_code=404, detail="No se encontró un candidato para habilitar.")
    account.role = Role.RECRUITER
    db.commit()
    return user_data(account, db, viewer)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: str, request: Request, response: Response, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN)
    account = db.get(User, user_id)
    if not account:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if account.id == viewer.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta de administrador desde aquí.")

    # 1. Eliminar postulaciones del usuario si es candidato
    applications = db.scalars(select(Application).where(Application.candidate_id == account.id)).all()
    for app_item in applications:
        db.query(ApplicationActivity).filter(ApplicationActivity.application_id == app_item.id).delete(synchronize_session=False)
        db.delete(app_item)

    # 2. Reasignar vacantes si era reclutador
    db.query(Vacancy).filter(Vacancy.recruiter_id == account.id).update({Vacancy.recruiter_id: viewer.id}, synchronize_session=False)
    db.query(Application).filter(Application.assigned_recruiter_id == account.id).update({Application.assigned_recruiter_id: None}, synchronize_session=False)

    # 3. Eliminar documentos del usuario
    documents = db.scalars(select(Document).where(Document.owner_id == account.id)).all()
    paths = [UPLOAD_DIR / doc.storage_name for doc in documents]
    for doc in documents:
        db.delete(doc)

    # 4. Eliminar sesiones y tokens
    db.query(AuthSession).filter(AuthSession.user_id == account.id).delete(synchronize_session=False)
    db.query(EmailToken).filter(EmailToken.user_id == account.id).delete(synchronize_session=False)

    # 5. Eliminar usuario definitivamente
    db.delete(account)
    db.commit()

    for p in paths:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/vacancies")
def list_vacancies(
    request: Request,
    q: str = "",
    location: str = "",
    vacancy_type: str = "",
    status_filter: str = "",
    sort: Literal["created_at", "title", "location", "type"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    query = select(Vacancy)
    if viewer.role == Role.CANDIDATE:
        query = query.where(Vacancy.status == "active")
        if status_filter and status_filter != "active":
            raise HTTPException(status_code=400, detail="Los candidatos solo pueden buscar vacantes activas.")
    elif viewer.role == Role.RECRUITER:
        query = query.where(
            or_(
                Vacancy.recruiter_id == viewer.id,
                Vacancy.applications.any(Application.assigned_recruiter_id == viewer.id),
            )
        )
        if status_filter not in ("", "active", "closed"):
            raise HTTPException(status_code=400, detail="Estado de vacante no válido.")
        if status_filter:
            query = query.where(Vacancy.status == status_filter)
    else:
        if status_filter not in ("", "active", "closed"):
            raise HTTPException(status_code=400, detail="Estado de vacante no válido.")
        if status_filter:
            query = query.where(Vacancy.status == status_filter)
    if q.strip():
        term = f"%{q.strip()}%"
        search_filter = or_(
            Vacancy.title.ilike(term),
            Vacancy.description.ilike(term),
            Vacancy.type.ilike(term),
        )
        query = query.where(search_filter)
    if location.strip():
        query = query.where(Vacancy.location.ilike(f"%{location.strip()}%"))
    if vacancy_type.strip():
        query = query.where(Vacancy.type.ilike(f"%{vacancy_type.strip()}%"))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordering_column = {
        "created_at": Vacancy.created_at,
        "title": Vacancy.title,
        "location": Vacancy.location,
        "type": Vacancy.type,
    }[sort]
    ordering = ordering_column.asc() if order == "asc" else ordering_column.desc()
    query = query.options(
        joinedload(Vacancy.recruiter),
        joinedload(Vacancy.applications).joinedload(Application.candidate),
        joinedload(Vacancy.applications).joinedload(Application.resume),
        joinedload(Vacancy.applications).joinedload(Application.assigned_recruiter),
        joinedload(Vacancy.applications).joinedload(Application.activities).joinedload(
            ApplicationActivity.author
        ),
    )
    vacancies = db.scalars(
        query.order_by(ordering, Vacancy.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return {
        "items": [vacancy_data(vacancy, viewer) for vacancy in vacancies],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/vacancies", status_code=201)
def create_vacancy(payload: VacancyRequest, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER)
    if payload.status != "active":
        raise HTTPException(status_code=422, detail="Una vacante nueva debe estar activa.")
    recruiter = viewer
    if viewer.role == Role.ADMIN and payload.recruiter_id:
        recruiter = db.get(User, payload.recruiter_id)
        if not recruiter or recruiter.role != Role.RECRUITER:
            raise HTTPException(status_code=422, detail="Selecciona un reclutador válido.")
    vacancy = Vacancy(
        title=payload.title.strip(),
        type=payload.type.strip(),
        location=payload.location.strip(),
        description=payload.description.strip(),
        recruiter_id=recruiter.id if recruiter.role == Role.RECRUITER else None,
    )
    if not vacancy.title or not vacancy.type or not vacancy.description:
        raise HTTPException(status_code=422, detail="Completa los campos obligatorios.")
    db.add(vacancy)
    db.commit()
    db.refresh(vacancy)
    return vacancy_data(vacancy, viewer)


@app.patch("/api/vacancies/{vacancy_id}")
def update_vacancy(vacancy_id: str, payload: VacancyRequest, request: Request, db: Session = Depends(get_db)):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER)
    vacancy = db.scalar(
        select(Vacancy)
        .options(joinedload(Vacancy.recruiter), joinedload(Vacancy.applications))
        .where(Vacancy.id == vacancy_id)
    )
    if not vacancy or (
        viewer.role == Role.RECRUITER and vacancy.recruiter_id != viewer.id
    ):
        raise HTTPException(status_code=404, detail="No se encontró una vacante editable.")
    if payload.status not in ("active", "closed"):
        raise HTTPException(status_code=422, detail="El estado de la vacante no es válido.")
    vacancy.title = payload.title.strip()
    vacancy.type = payload.type.strip()
    vacancy.location = payload.location.strip()
    vacancy.description = payload.description.strip()
    vacancy.status = payload.status
    if viewer.role == Role.ADMIN:
        if payload.recruiter_id:
            recruiter = db.get(User, payload.recruiter_id)
            if not recruiter or recruiter.role != Role.RECRUITER:
                raise HTTPException(status_code=422, detail="Selecciona un reclutador válido.")
            vacancy.recruiter_id = recruiter.id
        else:
            vacancy.recruiter_id = None
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
        raise HTTPException(status_code=404, detail="No se encontró la vacante a eliminar.")
    db.delete(vacancy)
    db.commit()
    return None


@app.post("/api/documents", status_code=201)
def upload_document(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.CANDIDATE)
    path, storage_name, media_type, size = save_upload(file)
    document = Document(
        owner_id=viewer.id,
        original_name=Path(file.filename or "documento").name[:255],
        media_type=media_type,
        storage_name=storage_name,
        size=size,
    )
    db.add(document)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return {"id": document.id, "name": document.original_name, "type": media_type, "size": size}


@app.get("/api/documents/{document_id}")
def download_document(document_id: str, request: Request, db: Session = Depends(get_db)):
    viewer = current_user(request, db)
    document = get_document_or_404(db, document_id)
    if not can_read_document(db, viewer, document):
        raise HTTPException(status_code=404, detail="No se encontró el documento.")
    path = UPLOAD_DIR / document.storage_name
    if not path.is_file():
        seed_path = ROOT / "backend" / "seed_uploads" / document.storage_name
        if seed_path.is_file():
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(seed_path, path)
            except Exception:
                pass
        if not path.is_file():
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            cand_name = document.owner.name if document.owner else "Candidato"
            cand_email = document.owner.email if document.owner else "candidato@recruitpro.com"
            fallback_bytes = generate_fallback_pdf(cand_name, cand_email, document.original_name)
            with open(path, "wb") as f_out:
                f_out.write(fallback_bytes)
    return FileResponse(
        path,
        media_type=document.media_type,
        filename=document.original_name,
        content_disposition_type="inline",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
            "X-Document-Name": quote(document.original_name),
        },
    )


@app.post("/api/vacancies/{vacancy_id}/applications", status_code=201)
def apply_to_vacancy(
    vacancy_id: str,
    request: Request,
    name: str = Form(min_length=1, max_length=100),
    phone: str = Form(min_length=1, max_length=30),
    location: str = Form(min_length=1, max_length=100),
    privacy_consent: bool = Form(...),
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    candidate = current_user(request, db)
    require_role(candidate, Role.CANDIDATE)
    if not privacy_consent:
        raise HTTPException(status_code=422, detail="Debes aceptar el aviso de privacidad para postularte.")
    vacancy = db.scalar(select(Vacancy).where(Vacancy.id == vacancy_id))
    if not vacancy or vacancy.status != "active":
        raise HTTPException(status_code=404, detail="Esta vacante ya no está disponible.")
    if db.scalar(
        select(Application.id).where(
            Application.vacancy_id == vacancy_id,
            Application.candidate_id == candidate.id,
        )
    ):
        raise HTTPException(status_code=409, detail="Ya te postulaste a esta vacante.")
    path, storage_name, media_type, size = save_upload(resume)
    document = Document(
        owner_id=candidate.id,
        original_name=Path(resume.filename or "cv").name[:255],
        media_type=media_type,
        storage_name=storage_name,
        size=size,
    )
    candidate.name = name.strip()
    candidate.phone = phone.strip()
    candidate.location = location.strip()
    candidate.last_activity_at = utc_now()
    db.add(document)
    db.flush()
    application = Application(
        vacancy_id=vacancy.id,
        candidate_id=candidate.id,
        name=candidate.name,
        phone=candidate.phone,
        location=candidate.location,
        resume_id=document.id,
        privacy_consent_at=utc_now(),
        privacy_consent_version=PRIVACY_CONSENT_VERSION,
    )
    db.add(application)
    db.flush()
    db.add(
        ApplicationActivity(
            application_id=application.id,
            author_id=candidate.id,
            event_type="status",
            to_status="recibida",
        )
    )
    try:
        db.flush()
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        path.unlink(missing_ok=True)
        if isinstance(error, IntegrityError):
            raise HTTPException(status_code=409, detail="No se pudo registrar la postulación.") from error
        raise
    sent = notify_user(
        candidate.email,
        "Recibimos tu postulación",
        f"Recibimos tu postulación para {vacancy.title}. Puedes consultar su avance en tu panel de RecruitPro.",
    )
    return {
        "message": "Postulación enviada.",
        "applicationId": application.id,
        "emailSent": sent,
    }


@app.get("/api/applications")
def list_all_applications(
    request: Request,
    vacancy_id: str = "",
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER)
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
                "status": app_item.status,
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
    require_role(viewer, Role.ADMIN, Role.RECRUITER)
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
        if not assignee or assignee.role != Role.RECRUITER:
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
    if status_changed:
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
def delete_application(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    verify_csrf(request)
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER)
    application = db.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Postulación no encontrada.")
    if viewer.role != Role.ADMIN:
        vacancy = db.get(Vacancy, application.vacancy_id)
        if not vacancy or (vacancy.recruiter_id != viewer.id and application.assigned_recruiter_id != viewer.id):
            raise HTTPException(status_code=403, detail="No tienes permisos para eliminar esta postulación.")

    db.query(ApplicationActivity).filter(ApplicationActivity.application_id == application_id).delete(synchronize_session=False)
    db.delete(application)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==========================================================================
# ARTIFICIAL INTELLIGENCE (AI) RECRUITMENT & SCREENING ENDPOINTS
# ==========================================================================

@app.get("/api/ai/analyze-application/{application_id}")
def ai_analyze_application(
    application_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    require_role(viewer, Role.ADMIN, Role.RECRUITER)

    application = db.scalar(
        select(Application)
        .options(
            joinedload(Application.vacancy),
            joinedload(Application.candidate),
            joinedload(Application.resume),
        )
        .where(Application.id == application_id)
    )
    if not application:
        raise HTTPException(status_code=404, detail="No se encontró la postulación.")

    resume_text = ""
    if application.resume:
        file_path = UPLOAD_DIR / application.resume.storage_name
        resume_text = extract_text_from_file(file_path)

    analysis = analyze_compatibility(
        candidate_name=application.name,
        candidate_email=application.candidate.email if application.candidate else "",
        candidate_location=application.location or "",
        vacancy_title=application.vacancy.title if application.vacancy else "Puesto general",
        vacancy_description=application.vacancy.description if application.vacancy else "",
        vacancy_type=application.vacancy.type if application.vacancy else "",
        resume_text=resume_text,
    )
    application.ai_score = analysis.get("matchScore")
    application.ai_verdict = analysis.get("verdict")
    application.ai_summary = analysis.get("summary")
    application.ai_analyzed_at = datetime.now(timezone.utc)
    db.commit()
    return analysis


@app.get("/api/ai/analyze-vacancy-fit/{vacancy_id}")
def ai_analyze_candidate_vacancy_fit(
    vacancy_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    viewer = current_user(request, db)
    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy:
        raise HTTPException(status_code=404, detail="Vacante no encontrada.")

    resume_text = ""
    # Look for candidate's latest uploaded resume
    latest_doc = db.scalar(
        select(Document)
        .where(Document.owner_id == viewer.id)
        .order_by(Document.created_at.desc())
    )
    if latest_doc:
        file_path = UPLOAD_DIR / latest_doc.storage_name
        resume_text = extract_text_from_file(file_path)

    analysis = analyze_compatibility(
        candidate_name=viewer.name,
        candidate_email=viewer.email,
        candidate_location=viewer.location or "",
        vacancy_title=vacancy.title,
        vacancy_description=vacancy.description,
        vacancy_type=vacancy.type,
        resume_text=resume_text,
    )
    application.ai_score = analysis.get("matchScore")
    application.ai_verdict = analysis.get("verdict")
    application.ai_summary = analysis.get("summary")
    application.ai_analyzed_at = datetime.now(timezone.utc)
    db.commit()
    return analysis


# ==========================================================================
# PUBLIC CAREERS PORTAL ENDPOINTS
# ==========================================================================

@app.get("/api/public/vacancies")
def list_public_vacancies(
    q: str = "",
    location: str = "",
    vacancy_type: str = "",
    db: Session = Depends(get_db),
):
    query = select(Vacancy).where(Vacancy.status == "active")
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.where(or_(Vacancy.title.ilike(term), Vacancy.description.ilike(term)))
    if location.strip():
        query = query.where(Vacancy.location.ilike(f"%{location.strip()}%"))
    if vacancy_type.strip():
        query = query.where(Vacancy.type.ilike(f"%{vacancy_type.strip()}%"))

    vacancies = db.scalars(query.order_by(Vacancy.created_at.desc())).all()
    return {
        "items": [
            {
                "id": v.id,
                "title": v.title,
                "type": v.type,
                "location": v.location,
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
    phone: str = Form(""),
    location: str = Form(""),
    privacy_consent: bool = Form(...),
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not privacy_consent:
        raise HTTPException(status_code=422, detail="Debes aceptar el aviso de privacidad.")
    clean_email = normalize_email(email)
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=422, detail="Ingresa tu nombre completo.")

    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy or vacancy.status != "active":
        raise HTTPException(status_code=404, detail="La vacante seleccionada ya no está disponible.")

    user = db.scalar(select(User).where(User.email == clean_email))
    if not user:
        random_pwd = secrets.token_urlsafe(16)
        user = User(
            name=clean_name,
            email=clean_email,
            password_hash=password_hash.hash(random_pwd),
            role=Role.CANDIDATE,
            phone=phone.strip() or None,
            location=location.strip() or None,
            email_verified_at=utc_now(),
            last_activity_at=utc_now(),
            privacy_consent_at=utc_now(),
            privacy_consent_version=PRIVACY_CONSENT_VERSION,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    existing_app = db.scalar(
        select(Application.id).where(
            Application.vacancy_id == vacancy.id,
            Application.candidate_id == user.id,
        )
    )
    if existing_app:
        raise HTTPException(status_code=409, detail="Ya tienes una postulación activa para esta vacante.")

    path, storage_name, media_type, size = save_upload(resume)
    document = Document(
        owner_id=user.id,
        original_name=Path(resume.filename or "cv_documento").name[:255],
        media_type=media_type,
        storage_name=storage_name,
        size=size,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    application = Application(
        vacancy_id=vacancy.id,
        candidate_id=user.id,
        name=clean_name,
        phone=phone.strip(),
        location=location.strip(),
        resume_id=document.id,
        status="recibida",
        assigned_recruiter_id=vacancy.recruiter_id,
        privacy_consent_at=utc_now(),
        privacy_consent_version=PRIVACY_CONSENT_VERSION,
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    db.add(
        ApplicationActivity(
            application_id=application.id,
            author_id=user.id,
            event_type="status",
            to_status="recibida",
            note="Postulación directa desde el portal público de empleo.",
        )
    )
    db.commit()

    return {
        "message": "¡Tu postulación ha sido recibida con éxito! Nuestro equipo revisará tu perfil.",
        "applicationId": application.id,
        "candidateName": clean_name,
    }


@app.get("/empleos.html")
@app.get("/empleos")
def public_careers_page():
    return FileResponse(ROOT / "empleos.html")


@app.get("/")
@app.get("/index.html")
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
