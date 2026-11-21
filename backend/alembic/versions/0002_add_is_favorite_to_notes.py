"""add is_favorite to notes

The second migration: it adds the is_favorite column to the existing notes table.

This is the classic case that migrations exist for: the table already holds data, so we
cannot drop it and create it again. Instead we ALTER the table. server_default makes the
database fill the new column with false for every row that already exists.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("notes", "is_favorite")
