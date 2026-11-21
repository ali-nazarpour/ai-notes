"""
Notes.

``body`` holds the rich document (TipTap/ProseMirror JSON). ``content`` holds the same
document as plain text; it is what search and the AI read. ``excerpt`` is a short preview
stored separately, so note lists never have to load the (possibly very large) content.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, false, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType

TITLE_MAX_LENGTH = 200
EXCERPT_LENGTH = 280


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable only for notes created before accounts existed (adopted on first sign-up).
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", name="fk_notes_user_id_users"),
        nullable=True,
        index=True,
    )
    # Nullable only for notes created before accounts existed.
    workspace_id: Mapped[int | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL", name="fk_notes_category_id_categories"),
        nullable=True,
        index=True,
    )
    # Optional link to a project; the item works the same without one.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(TITLE_MAX_LENGTH), nullable=False, default="", server_default=""
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    excerpt: Mapped[str] = mapped_column(
        String(EXCERPT_LENGTH + 20), nullable=False, default="", server_default=""
    )
    cover: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_favorite: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # {"font": "default|serif|mono", "small_text": bool, "full_width": bool,
    #  "toc": bool, "locked": bool}
    settings: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    # Set when the note is in the trash.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", name="fk_notes_updated_by_users"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
