import os
import sys

from sqlalchemy import select

from .database import SessionLocal
from .models import Role, User
from .security import password_hash


def main() -> None:
    name = os.getenv("BOOTSTRAP_ADMIN_NAME", "").strip()
    email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not name or not email or len(password) < 12:
        raise SystemExit(
            "Define BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL y "
            "BOOTSTRAP_ADMIN_PASSWORD (mínimo 12 caracteres)."
        )

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.role == Role.ADMIN).limit(1)):
            raise SystemExit("Ya existe un administrador; no se creó otra cuenta.")
        admin = User(
            name=name,
            email=email,
            password_hash=password_hash.hash(password),
            role=Role.ADMIN,
        )
        db.add(admin)
        db.commit()
        print(f"Administrador creado: {email}")


if __name__ == "__main__":
    main()
