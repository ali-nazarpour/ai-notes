"""profile details, sessions info, password vault, boards

- users: first_name, last_name, birth_date, phone, address, bio, avatar
- auth_tokens: user_agent, last_used_at
- vaults / vault_items: end-to-end encrypted password manager
- boards / board_lists / board_cards / card_comments: kanban boards

Additive only: no existing data is changed.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _text(name: str, length: int) -> sa.Column:
    return sa.Column(name, sa.String(length=length), nullable=False, server_default="")


def _user_fk() -> sa.Column:
    return sa.Column(
        "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    for column in (
        _text("first_name", 60),
        _text("last_name", 60),
        sa.Column("birth_date", sa.Date(), nullable=True),
        _text("phone", 30),
        _text("address", 300),
        _text("bio", 300),
        sa.Column("avatar", sa.String(length=80), nullable=True),
    ):
        op.add_column("users", column)

    op.add_column("auth_tokens", _text("user_agent", 300))
    op.add_column(
        "auth_tokens", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.create_table(
        "vaults",
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("kdf", sa.String(length=20), nullable=False),
        sa.Column("iterations", sa.Integer(), nullable=False),
        sa.Column("salt", sa.String(length=64), nullable=False),
        sa.Column("verifier", sa.Text(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_table(
        "vault_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        _user_fk(),
        sa.Column("data", sa.Text(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_index("ix_vault_items_user_id", "vault_items", ["user_id"])

    op.create_table(
        "boards",
        sa.Column("id", sa.Integer(), primary_key=True),
        _user_fk(),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "background", sa.String(length=300), nullable=False, server_default="gradient:ocean"
        ),
        sa.Column("starred", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("labels", JSON_TYPE, nullable=True),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_index("ix_boards_user_id", "boards", ["user_id"])

    op.create_table(
        "board_lists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "board_id",
            sa.Integer(),
            sa.ForeignKey("boards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("color", sa.String(length=20), nullable=True),
        sa.Column("wip_limit", sa.Integer(), nullable=True),
        _timestamp("created_at"),
    )
    op.create_index("ix_board_lists_board_id", "board_lists", ["board_id"])

    op.create_table(
        "board_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "board_id",
            sa.Integer(),
            sa.ForeignKey("boards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "list_id",
            sa.Integer(),
            sa.ForeignKey("board_lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("description", JSON_TYPE, nullable=True),
        sa.Column("description_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("label_ids", JSON_TYPE, nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("due_done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cover", sa.String(length=300), nullable=True),
        sa.Column("checklists", JSON_TYPE, nullable=True),
        sa.Column("attachments", JSON_TYPE, nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_index("ix_board_cards_board_id", "board_cards", ["board_id"])
    op.create_index("ix_board_cards_list_id", "board_cards", ["list_id"])

    op.create_table(
        "card_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "card_id",
            sa.Integer(),
            sa.ForeignKey("board_cards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        _timestamp("created_at"),
    )
    op.create_index("ix_card_comments_card_id", "card_comments", ["card_id"])


def downgrade() -> None:
    op.drop_table("card_comments")
    op.drop_table("board_cards")
    op.drop_table("board_lists")
    op.drop_table("boards")
    op.drop_table("vault_items")
    op.drop_table("vaults")
    op.drop_column("auth_tokens", "last_used_at")
    op.drop_column("auth_tokens", "user_agent")
    for name in ("avatar", "bio", "address", "phone", "birth_date", "last_name", "first_name"):
        op.drop_column("users", name)
