"""rich notes, files, chats, language

- users.language
- notes: body (rich document JSON), excerpt, cover; titles may now be empty ("Untitled")
- files: uploaded images and videos (bytes live in object storage)
- chat_conversations / chat_messages: Ask-AI history

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("language", sa.String(length=5), nullable=False, server_default="en")
    )

    op.add_column("notes", sa.Column("body", JSON_TYPE, nullable=True))
    op.add_column(
        "notes", sa.Column("excerpt", sa.String(length=300), nullable=False, server_default="")
    )
    op.add_column("notes", sa.Column("cover", sa.String(length=300), nullable=True))
    op.alter_column("notes", "title", server_default="")
    op.drop_constraint("ck_notes_title_not_blank", "notes", type_="check")
    op.execute(sa.text("UPDATE notes SET excerpt = substr(content, 1, 280)"))

    op.create_table(
        "files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("object_key", sa.String(length=255), nullable=False),
        _created_at(),
        sa.UniqueConstraint("object_key", name="uq_files_object_key"),
    )
    op.create_index("ix_files_user_id", "files", ["user_id"])

    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("scope", JSON_TYPE, nullable=True),
        _created_at(),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_chat_conversations_user_id", "chat_conversations", ["user_id"])

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", JSON_TYPE, nullable=True),
        sa.Column("meta", JSON_TYPE, nullable=True),
        _created_at(),
    )
    op.create_index("ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"])


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_conversations")
    op.drop_table("files")
    op.execute(sa.text("UPDATE notes SET title = 'Untitled' WHERE length(trim(title)) = 0"))
    op.create_check_constraint("ck_notes_title_not_blank", "notes", "length(trim(title)) > 0")
    op.drop_column("notes", "cover")
    op.drop_column("notes", "excerpt")
    op.drop_column("notes", "body")
    op.drop_column("users", "language")
