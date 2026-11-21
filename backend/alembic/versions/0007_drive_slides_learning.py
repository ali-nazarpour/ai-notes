"""drive, slide decks, language learning

- drive_items: folders and files (tree), trash, stars, public links
- slide_decks: presentations with slides (JSON), music and auto-play
- lang_decks / lang_cards / lang_reviews: flashcards with spaced repetition
- lang_songs: songs with timed lyrics and translations

Only new tables; existing data is not touched.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _text(name: str, length: int) -> sa.Column:
    return sa.Column(name, sa.String(length=length), nullable=False, server_default="")


def _flag(name: str) -> sa.Column:
    return sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false())


def _ws_fk() -> sa.Column:
    return sa.Column(
        "workspace_id",
        sa.Integer(),
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )


def _user(name: str) -> sa.Column:
    return sa.Column(
        name, sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


def _int(name: str, default: str) -> sa.Column:
    return sa.Column(name, sa.Integer(), nullable=False, server_default=default)


def upgrade() -> None:
    op.create_table(
        "drive_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("drive_items.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        _flag("is_folder"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "file_id",
            sa.Uuid(),
            sa.ForeignKey("files.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        _text("kind", 10),
        _text("content_type", 100),
        sa.Column("size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("color", sa.String(20), nullable=True),
        _text("description", 500),
        _flag("starred"),
        sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("link_token", sa.String(64), nullable=True),
        _user("owner_id"),
        _user("updated_by"),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.UniqueConstraint("link_token", name="uq_drive_items_link_token"),
    )
    op.create_table(
        "slide_decks",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        _user("user_id"),
        _text("title", 200),
        _text("description", 500),
        sa.Column("theme", sa.String(20), nullable=False, server_default="aurora"),
        sa.Column("transition", sa.String(10), nullable=False, server_default="fade"),
        _int("auto_seconds", "0"),
        _flag("loop"),
        sa.Column("music_url", sa.String(300), nullable=True),
        _text("music_name", 200),
        _int("music_volume", "70"),
        sa.Column("slides", JSON_TYPE, nullable=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        _flag("starred"),
        _user("updated_by"),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_table(
        "lang_decks",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        _user("user_id"),
        sa.Column("name", sa.String(120), nullable=False),
        _text("description", 500),
        sa.Column("source_lang", sa.String(8), nullable=False, server_default="en"),
        sa.Column("target_lang", sa.String(8), nullable=False, server_default="fa"),
        sa.Column("color", sa.String(20), nullable=False, server_default="violet"),
        _text("icon", 16),
        _int("new_per_day", "20"),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_table(
        "lang_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "deck_id",
            sa.Integer(),
            sa.ForeignKey("lang_decks.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("front", sa.String(500), nullable=False),
        _text("back", 500),
        _text("pronunciation", 200),
        _text("part_of_speech", 40),
        _text("example", 1000),
        _text("example_translation", 1000),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("image", sa.String(300), nullable=True),
        sa.Column("tags", JSON_TYPE, nullable=True),
        _flag("starred"),
        sa.Column("state", sa.String(10), nullable=False, server_default="new"),
        sa.Column("ease", sa.Float(), nullable=False, server_default="2.5"),
        sa.Column("interval_days", sa.Float(), nullable=False, server_default="0"),
        _int("reps", "0"),
        _int("lapses", "0"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("last_review_at", sa.DateTime(timezone=True), nullable=True),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_table(
        "lang_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        _user("user_id"),
        sa.Column(
            "card_id",
            sa.Integer(),
            sa.ForeignKey("lang_cards.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("grade", sa.Integer(), nullable=False),
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
    )
    op.create_table(
        "lang_songs",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        _user("user_id"),
        sa.Column(
            "deck_id",
            sa.Integer(),
            sa.ForeignKey("lang_decks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        _text("artist", 200),
        sa.Column("source_lang", sa.String(8), nullable=False, server_default="en"),
        sa.Column("target_lang", sa.String(8), nullable=False, server_default="fa"),
        sa.Column("media_url", sa.String(300), nullable=True),
        sa.Column("youtube_url", sa.String(300), nullable=True),
        sa.Column("cover", sa.String(300), nullable=True),
        sa.Column("lines", JSON_TYPE, nullable=True),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )


def downgrade() -> None:
    for table in (
        "lang_songs",
        "lang_reviews",
        "lang_cards",
        "lang_decks",
        "slide_decks",
        "drive_items",
    ):
        op.drop_table(table)
