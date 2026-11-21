"""accounts, categories and tasks

The third migration adds:
    - users and auth_tokens  (accounts and login sessions)
    - categories             (colored groups for notes and tasks)
    - tasks                  (the to-do list; the calendar is built from due_date)
    - notes.user_id and notes.category_id

notes.user_id is added as NULLABLE on purpose. The table already contains notes, and at
this moment there is no user they could belong to. Instead of deleting them, the first
account that registers adopts them (see services/auth.py). Nothing is lost.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        )
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("theme", sa.String(length=10), nullable=False, server_default="system"),
        sa.Column("accent_color", sa.String(length=20), nullable=False, server_default="indigo"),
        *_timestamps(),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        *_timestamps(),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_auth_tokens_token_hash"),
    )
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("icon", sa.String(length=16), nullable=False, server_default=""),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_categories_name_not_blank"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        *_timestamps(),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_tasks_title_not_blank"),
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_index("ix_tasks_due_date", "tasks", ["due_date"])
    op.create_index("ix_tasks_category_id", "tasks", ["category_id"])

    # Existing table: add the columns first, then the foreign keys and indexes.
    op.add_column("notes", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("notes", sa.Column("category_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_notes_user_id_users", "notes", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_notes_category_id_categories",
        "notes",
        "categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_notes_user_id", "notes", ["user_id"])
    op.create_index("ix_notes_category_id", "notes", ["category_id"])


def downgrade() -> None:
    op.drop_index("ix_notes_category_id", table_name="notes")
    op.drop_index("ix_notes_user_id", table_name="notes")
    op.drop_constraint("fk_notes_category_id_categories", "notes", type_="foreignkey")
    op.drop_constraint("fk_notes_user_id_users", "notes", type_="foreignkey")
    op.drop_column("notes", "category_id")
    op.drop_column("notes", "user_id")
    op.drop_table("tasks")
    op.drop_table("categories")
    op.drop_table("auth_tokens")
    op.drop_table("users")
