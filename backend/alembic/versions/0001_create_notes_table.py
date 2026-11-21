"""create notes table

The first migration of the project: it creates the notes table.

Every migration file has two functions:
    upgrade()   : applies the change (moves to a newer version).
    downgrade() : undoes the same change (goes back to the previous version).

revision is the ID of this version and down_revision points to the previous version
(None means this is the first version). Alembic uses this chain to know the running order.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("length(trim(title)) > 0", name="ck_notes_title_not_blank"),
    )


def downgrade() -> None:
    op.drop_table("notes")
