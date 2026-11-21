"""drive sections (music, videos, photos, documents) and links from items to projects

- drive_items.section: files | music | videos | photos | documents (existing rows: files)
- project_id (optional, SET NULL) on notes, tasks, boards, doc_spaces, slide_decks and
  drive_items; the board and documentation already linked to a project keep their link.

Adds columns only; no data is removed.

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LINKED = ("notes", "tasks", "boards", "doc_spaces", "slide_decks", "drive_items")


def upgrade() -> None:
    op.add_column(
        "drive_items",
        sa.Column("section", sa.String(12), nullable=False, server_default="files"),
    )
    op.create_index("ix_drive_items_section", "drive_items", ["section"])
    for table in LINKED:
        op.add_column(table, sa.Column("project_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_project_id_projects",
            table,
            "projects",
            ["project_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_project_id", table, ["project_id"])
    op.execute(
        "UPDATE boards SET project_id = projects.id FROM projects "
        "WHERE projects.board_id = boards.id"
    )
    op.execute(
        "UPDATE doc_spaces SET project_id = projects.id FROM projects "
        "WHERE projects.doc_space_id = doc_spaces.id"
    )


def downgrade() -> None:
    for table in LINKED:
        op.drop_index(f"ix_{table}_project_id", table_name=table)
        op.drop_constraint(f"fk_{table}_project_id_projects", table, type_="foreignkey")
        op.drop_column(table, "project_id")
    op.drop_index("ix_drive_items_section", table_name="drive_items")
    op.drop_column("drive_items", "section")
