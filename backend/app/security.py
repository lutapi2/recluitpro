import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, Response, status
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .models import AuthSession, Role, User


password_hash = PasswordHash.recommended()
SESSION_COOKIE = "recruitpro_session"
CSRF_COOKIE = "recruitpro_csrf"
SESSION_DAYS = 7
environment = os.getenv("ENVIRONMENT", "development").lower()
COOKIE_SECURE = os.getenv(
    "COOKIE_SECURE", "true" if environment == "production" else "false"
).lower() == "true"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_csrf(request: Request) -> None:
    origin = request.headers.get("origin")
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    valid_origins = {
        f"https://{host}",
        f"http://{host}",
        f"{scheme}://{host}"
    }
    if origin and origin.rstrip("/") not in {vo.rstrip("/") for vo in valid_origins}:
        from urllib.parse import urlparse
        origin_host = urlparse(origin).netloc
        if origin_host != host:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origen de solicitud no válido.")
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get("x-csrf-token", "")
    if not cookie or not header or not hmac.compare_digest(cookie, header):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solicitud no válida.")


def set_csrf_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        CSRF_COOKIE,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


def create_session(response: Response, db: Session, user: User, request: Request) -> None:
    previous_token = request.cookies.get(SESSION_COOKIE)
    if previous_token:
        previous_session = db.scalar(
            select(AuthSession).where(AuthSession.token_hash == hash_token(previous_token))
        )
        if previous_session:
            db.delete(previous_session)
    token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        )
    )
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    set_csrf_cookie(response, csrf_token)


def clear_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", secure=COOKIE_SECURE, httponly=True, samesite="strict")
    response.delete_cookie(CSRF_COOKIE, path="/", secure=COOKIE_SECURE, samesite="strict")


def current_user(request: Request, db: Session) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inicia sesión para continuar.")

    session = db.scalar(
        select(AuthSession)
        .options(joinedload(AuthSession.user))
        .where(
            AuthSession.token_hash == hash_token(token),
            AuthSession.expires_at > datetime.now(timezone.utc),
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="La sesión expiró. Inicia sesión de nuevo.")
    last_activity = session.user.last_activity_at
    if last_activity.tzinfo is None:
        last_activity = last_activity.replace(tzinfo=timezone.utc)
    if last_activity < datetime.now(timezone.utc) - timedelta(days=1):
        session.user.last_activity_at = datetime.now(timezone.utc)
        db.commit()
    return session.user


def require_role(user: User, *roles: Role) -> None:
    if user.role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para realizar esta acción.")
