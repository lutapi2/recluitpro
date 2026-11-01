import logging
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from .database import SessionLocal
from .main import RETENTION_MONTHS, UPLOAD_DIR
from .models import Application, Document, Role, User, utc_now


logger = logging.getLogger("recruitpro.retention")


def purge_inactive_candidates() -> int:
    cutoff = utc_now() - timedelta(days=round(365.2425 * RETENTION_MONTHS / 12))
    removed_files: list[Path] = []
    with SessionLocal() as db:
        candidates = db.scalars(
            select(User).where(
                User.role == Role.CANDIDATE,
                User.last_activity_at < cutoff,
            )
        ).all()
        for candidate in candidates:
            applications = db.scalars(
                select(Application).where(Application.candidate_id == candidate.id)
            ).all()
            document_ids = {
                document.id
                for document in db.scalars(
                    select(Document).where(Document.owner_id == candidate.id)
                ).all()
            }
            document_ids.update(application.resume_id for application in applications)
            documents = (
                db.scalars(select(Document).where(Document.id.in_(document_ids))).all()
                if document_ids
                else []
            )
            removed_files.extend(UPLOAD_DIR / document.storage_name for document in documents)
            for application in applications:
                db.delete(application)
            db.flush()
            for document in documents:
                db.delete(document)
            db.delete(candidate)
        db.commit()
        removed_count = len(candidates)

    for path in removed_files:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("No se pudo eliminar un documento privado vencido: %s", path)
    return removed_count


if __name__ == "__main__":
    count = purge_inactive_candidates()
    print(f"Se eliminaron {count} cuentas de candidato inactivas.")
