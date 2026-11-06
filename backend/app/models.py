from datetime import datetime, timezone
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import TypeDecorator, Boolean, DateTime, Enum, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship, deferred

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Role(StrEnum):
    CANDIDATE = "candidato"
    RECRUITER = "reclutador"
    TALENTO_HUMANO = "talento_humano"
    REVIEWER = "revisor"
    INTERVIEWER = "entrevistador"
    ACADEMIC_LEAD = "desarrollo_profesoral"
    OCCUPATIONAL_HEALTH = "salud_ocupacional"
    ADMIN = "administrador"
    AUDITOR = "auditor"


class RoleType(TypeDecorator):
    impl = String(50)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, Role):
            return value.value
        val_str = str(value).lower()
        for r in Role:
            if r.value == val_str or r.name.lower() == val_str:
                return r.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        val_str = str(value).lower()
        for r in Role:
            if r.value == val_str or r.name.lower() == val_str:
                return r
        return value


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(RoleType(), default=Role.CANDIDATE)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    faculty: Mapped[str | None] = mapped_column(String(150), nullable=True, default="Facultad de Educación y Ciencias Sociales")
    campus: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Sede Principal Sincelejo")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    privacy_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    privacy_consent_version: Mapped[str | None] = mapped_column(String(30), nullable=True)

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    tickets: Mapped[list["HelpTicket"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", foreign_keys="HelpTicket.user_id"
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="sessions")


class EmailToken(Base):
    __tablename__ = "email_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(20), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship()


class Vacancy(Base):
    __tablename__ = "vacancies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    title: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(60))
    location: Mapped[str] = mapped_column(String(100), default="")
    faculty: Mapped[str | None] = mapped_column(String(150), nullable=True, default="Facultad de Educación y Ciencias Sociales")
    program: Mapped[str | None] = mapped_column(String(150), nullable=True, default="Licenciatura / Ingeniería")
    campus: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Sede Principal Sincelejo")
    academic_period: Mapped[str | None] = mapped_column(String(30), nullable=True, default="2026-2")
    vacancies_count: Mapped[int] = mapped_column(Integer, default=1)
    modality: Mapped[str | None] = mapped_column(String(50), nullable=True, default="Presencial")
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")  # draft, active, closed, retired
    opening_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closing_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    profile_json: Mapped[str | None] = mapped_column(Text, nullable=True, default="{}")
    requirements_config_json: Mapped[str | None] = mapped_column(Text, nullable=True, default="[]")
    criteria_config_json: Mapped[str | None] = mapped_column(Text, nullable=True, default="[]")
    stages_config_json: Mapped[str | None] = mapped_column(Text, nullable=True, default="[]")
    recruiter_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    recruiter: Mapped[User | None] = relationship()
    applications: Mapped[list["Application"]] = relationship(
        back_populates="vacancy", cascade="all, delete-orphan"
    )
    interview_slots: Mapped[list["InterviewSlot"]] = relationship(
        back_populates="vacancy", cascade="all, delete-orphan"
    )


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("vacancy_id", "candidate_id", name="uq_application_candidate_vacancy"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    vacancy_id: Mapped[str] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), index=True
    )
    candidate_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(30))
    location: Mapped[str] = mapped_column(String(100))
    resume_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    
    # Estados del proceso institucional:
    # 'borrador', 'enviada', 'en_revision', 'subsanacion_requerida', 'habilitada',
    # 'preseleccionada', 'entrevistada', 'seleccionada', 'no_seleccionada', 'no_continua', 'retirada',
    # 'examen_ocupacional', 'en_contratacion', 'vinculada'
    status: Mapped[str] = mapped_column(String(30), default="recibida")
    document_status: Mapped[str] = mapped_column(String(30), default="pendiente")  # pendiente, conforme, observado, no_conforme
    version: Mapped[int] = mapped_column(Integer, default=1)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    assigned_recruiter_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    privacy_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    privacy_consent_version: Mapped[str | None] = mapped_column(String(30), nullable=True)
    
    # Subsanación
    subsanacion_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Descarte y Decisión final
    discard_reason_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    discard_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_decision: Mapped[str | None] = mapped_column(String(50), nullable=True)
    final_decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_decision_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Consentimiento separado de Banco de Talento (RF-076, RN-021)
    talent_bank_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    talent_bank_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Evaluación y notas internas
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluation_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # AI ATS fields
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_verdict: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    vacancy: Mapped[Vacancy] = relationship(back_populates="applications")
    candidate: Mapped[User] = relationship(foreign_keys=[candidate_id])
    resume: Mapped["Document | None"] = relationship(foreign_keys=[resume_id])
    assigned_recruiter: Mapped[User | None] = relationship(foreign_keys=[assigned_recruiter_id])
    activities: Mapped[list["ApplicationActivity"]] = relationship(
        back_populates="application", cascade="all, delete-orphan", order_by="ApplicationActivity.created_at"
    )
    items: Mapped[list["ApplicationItem"]] = relationship(
        back_populates="application", cascade="all, delete-orphan", order_by="ApplicationItem.created_at"
    )
    subsanaciones: Mapped[list["SubsanacionRequest"]] = relationship(
        back_populates="application", cascade="all, delete-orphan", order_by="SubsanacionRequest.requested_at"
    )
    interviews: Mapped[list["Interview"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )
    tests: Mapped[list["TestResult"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )
    classroom_test: Mapped["ClassroomTest | None"] = relationship(
        back_populates="application", uselist=False, cascade="all, delete-orphan"
    )
    occupational_exam: Mapped["OccupationalExam | None"] = relationship(
        back_populates="application", uselist=False, cascade="all, delete-orphan"
    )
    hiring_dossier: Mapped["HiringDossier | None"] = relationship(
        back_populates="application", uselist=False, cascade="all, delete-orphan"
    )
    integration_logs: Mapped[list["InstitutionalIntegration"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )


class ApplicationActivity(Base):
    __tablename__ = "application_activities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(30))
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="activities")
    author: Mapped[User | None] = relationship()


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(100))
    storage_name: Mapped[str] = mapped_column(String(36), unique=True)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    file_data: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))

    owner: Mapped[User] = relationship(back_populates="documents")


# ==============================================================================
# HOJA DE VIDA POR ÍTEMS INDEPENDIENTES Y SOPORTES (RF-016 a RF-035, HV-001 - HV-026)
# ==============================================================================

class ApplicationItem(Base):
    __tablename__ = "application_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    item_type: Mapped[str] = mapped_column(String(50), index=True)  # HV-002, HV-006, etc.
    section: Mapped[str] = mapped_column(String(60), index=True)    # identificacion, formacion, etc.
    title: Mapped[str] = mapped_column(String(255))
    data_json: Mapped[str] = mapped_column(Text, default="{}")     # Campos detallados
    status: Mapped[str] = mapped_column(String(30), default="pendiente") # pendiente, aprobado, observado, rechazado
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_subsanacion: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="items")
    supports: Mapped[list["ItemSupport"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["ItemReview"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="ItemReview.reviewed_at"
    )


class ItemSupport(Base):
    __tablename__ = "item_supports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    item_id: Mapped[str] = mapped_column(
        ForeignKey("application_items.id", ondelete="CASCADE"), index=True
    )
    original_name: Mapped[str] = mapped_column(String(255))
    storage_name: Mapped[str] = mapped_column(String(36), unique=True)
    media_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    file_data: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    item: Mapped[ApplicationItem] = relationship(back_populates="supports")


class ItemReview(Base):
    __tablename__ = "item_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    item_id: Mapped[str] = mapped_column(
        ForeignKey("application_items.id", ondelete="CASCADE"), index=True
    )
    reviewer_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    result: Mapped[str] = mapped_column(String(30))  # aprobado, observado, rechazado
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    item: Mapped[ApplicationItem] = relationship(back_populates="reviews")
    reviewer: Mapped[User | None] = relationship()


class SubsanacionRequest(Base):
    __tablename__ = "subsanacion_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    requested_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), default="pendiente") # pendiente, respondida, vencida
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    items_summary: Mapped[str] = mapped_column(Text, default="[]") # JSON list of item ids/reasons
    general_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    application: Mapped[Application] = relationship(back_populates="subsanaciones")
    requested_by: Mapped[User | None] = relationship()


# ==============================================================================
# ENTREVISTAS, PRUEBAS Y COMITÉ (RF-060 a RF-072, RF-087 a RF-090)
# ==============================================================================

class InterviewSlot(Base):
    __tablename__ = "interview_slots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    vacancy_id: Mapped[str] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), index=True
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    modality: Mapped[str] = mapped_column(String(30), default="virtual") # presencial, virtual
    location_or_link: Mapped[str] = mapped_column(String(255), default="")
    max_capacity: Mapped[int] = mapped_column(Integer, default=1)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    vacancy: Mapped[Vacancy] = relationship(back_populates="interview_slots")


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    slot_id: Mapped[str | None] = mapped_column(
        ForeignKey("interview_slots.id", ondelete="SET NULL"), nullable=True
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=45)
    modality: Mapped[str] = mapped_column(String(30), default="virtual")
    location_or_link: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(30), default="programada") # programada, confirmada, reprogramacion_solicitada, realizada, cancelada
    candidate_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="interviews")
    evaluations: Mapped[list["InterviewEvaluation"]] = relationship(
        back_populates="interview", cascade="all, delete-orphan"
    )


class InterviewEvaluation(Base):
    __tablename__ = "interview_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    interview_id: Mapped[str] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"), index=True
    )
    evaluator_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    scores_json: Mapped[str] = mapped_column(Text, default="{}")
    total_score: Mapped[int] = mapped_column(Integer, default=0) # 0-100
    concept: Mapped[str] = mapped_column(String(50), default="favorable") # favorable, favorable_con_reservas, no_favorable
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_consolidated: Mapped[bool] = mapped_column(Boolean, default=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    interview: Mapped[Interview] = relationship(back_populates="evaluations")
    evaluator: Mapped[User | None] = relationship()


class TestResult(Base):
    __tablename__ = "test_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    test_type: Mapped[str] = mapped_column(String(40)) # psicotecnica, conocimiento
    name: Mapped[str] = mapped_column(String(120))
    score: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=100)
    passed: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluated_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="tests")
    evaluated_by: Mapped[User | None] = relationship()


class ClassroomTest(Base):
    __tablename__ = "classroom_tests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True, index=True
    )
    topic: Mapped[str] = mapped_column(String(200))
    rubric_json: Mapped[str] = mapped_column(Text, default="{}")
    score: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluator_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="classroom_test")
    evaluator: Mapped[User | None] = relationship()


# ==============================================================================
# FASE 2: SALUD OCUPACIONAL, CONTRATACIÓN, VINCULACIÓN E INTEGRACIÓN (RF-101 a RF-106)
# ==============================================================================

class OccupationalExam(Base):
    __tablename__ = "occupational_exams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True, index=True
    )
    provider: Mapped[str] = mapped_column(String(150), default="IPS Salud Ocupacional CECAR")
    # Concepto administrativo de aptitud sin diagnósticos clínicos sensibles (RN-027, RNF-028)
    fitness_concept: Mapped[str] = mapped_column(String(50), default="pendiente") # apto, apto_con_restricciones, no_apto, pendiente
    restrictions: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="occupational_exam")


class HiringDossier(Base):
    __tablename__ = "hiring_dossiers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True, index=True
    )
    status: Mapped[str] = mapped_column(String(30), default="pendiente") # pendiente, en_tramite, firmado, rechazado, formalizado
    checklist_json: Mapped[str] = mapped_column(Text, default="{}")
    responsible_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    formalization_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contract_type: Mapped[str | None] = mapped_column(String(60), default="Cátedra Universitaria")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="hiring_dossier")
    responsible: Mapped[User | None] = relationship()
    binding: Mapped["EmploymentBinding | None"] = relationship(
        back_populates="hiring", uselist=False, cascade="all, delete-orphan"
    )


class EmploymentBinding(Base):
    __tablename__ = "employment_bindings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hiring_id: Mapped[str] = mapped_column(
        ForeignKey("hiring_dossiers.id", ondelete="CASCADE"), unique=True, index=True
    )
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True, index=True
    )
    employee_code: Mapped[str] = mapped_column(String(50), unique=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="vinculado")
    confirmed_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    hiring: Mapped[HiringDossier] = relationship(back_populates="binding")
    confirmed_by: Mapped[User | None] = relationship()


class InstitutionalIntegration(Base):
    __tablename__ = "institutional_integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    destination_system: Mapped[str] = mapped_column(String(100), default="Sistema Hoja de Vida CECAR")
    status: Mapped[str] = mapped_column(String(30), default="transferido") # pendiente, transferido, error
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    transferred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    application: Mapped[Application] = relationship(back_populates="integration_logs")


# ==============================================================================
# MESA DE AYUDA, PLAN DE TRABAJO, CAUSALES Y CATÁLOGOS (RF-080, RF-091, RF-093, RF-099)
# ==============================================================================

class DiscardReason(Base):
    __tablename__ = "discard_reasons"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class HelpTicket(Base):
    __tablename__ = "help_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(60)) # postulación, documentos, plataforma, etc.
    subject: Mapped[str] = mapped_column(String(150))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="abierto") # abierto, en_proceso, resuelto
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="tickets", foreign_keys=[user_id])
    responded_by: Mapped[User | None] = relationship(foreign_keys=[responded_by_id])


class SelectionWorkPlan(Base):
    __tablename__ = "selection_work_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    vacancy_id: Mapped[str] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), unique=True, index=True
    )
    coordinator_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="activo")
    activities_json: Mapped[str] = mapped_column(Text, default="[]")

    coordinator: Mapped[User | None] = relationship()


class SystemAudit(Base):
    __tablename__ = "system_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str] = mapped_column(String(64))
    before_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User | None] = relationship()


class SystemParameter(Base):
    __tablename__ = "system_parameters"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
