"""Add recruiting workflow, account verification and privacy consent.

Revision ID: 0002_hiring_privacy_email
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_hiring_privacy_email"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("privacy_consent_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("privacy_consent_version", sa.String(length=30), nullable=True))
    op.execute(
        "UPDATE users SET last_activity_at = created_at, email_verified_at = created_at"
    )
    with op.batch_alter_table("users") as batch:
        batch.alter_column("last_activity_at", existing_type=sa.DateTime(timezone=True), nullable=False)

    op.create_table(
        "email_tokens",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_email_tokens_user_id", "email_tokens", ["user_id"])
    op.create_index("ix_email_tokens_token_hash", "email_tokens", ["token_hash"])
    op.create_index("ix_email_tokens_purpose", "email_tokens", ["purpose"])
    op.create_index("ix_email_tokens_expires_at", "email_tokens", ["expires_at"])

    with op.batch_alter_table("applications") as batch:
        batch.add_column(sa.Column("assigned_recruiter_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("privacy_consent_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("privacy_consent_version", sa.String(length=30), nullable=True))
        batch.create_foreign_key(
            "fk_applications_assigned_recruiter_id_users",
            "users",
            ["assigned_recruiter_id"],
            ["id"],
            ondelete="SET NULL",
        )
    with op.batch_alter_table("applications") as batch:
        batch.create_index("ix_applications_assigned_recruiter_id", ["assigned_recruiter_id"])

    op.create_table(
        "application_activities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("application_id", sa.String(length=36), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_application_activities_application_id", "application_activities", ["application_id"])


def downgrade() -> None:
    op.drop_index("ix_application_activities_application_id", table_name="application_activities")
    op.drop_table("application_activities")
    with op.batch_alter_table("applications") as batch:
        batch.drop_index("ix_applications_assigned_recruiter_id")
        batch.drop_constraint("fk_applications_assigned_recruiter_id_users", type_="foreignkey")
        batch.drop_column("privacy_consent_version")
        batch.drop_column("privacy_consent_at")
        batch.drop_column("assigned_recruiter_id")
    op.drop_index("ix_email_tokens_expires_at", table_name="email_tokens")
    op.drop_index("ix_email_tokens_purpose", table_name="email_tokens")
    op.drop_index("ix_email_tokens_token_hash", table_name="email_tokens")
    op.drop_index("ix_email_tokens_user_id", table_name="email_tokens")
    op.drop_table("email_tokens")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("privacy_consent_version")
        batch.drop_column("privacy_consent_at")
        batch.drop_column("email_verified_at")
        batch.drop_column("last_activity_at")
