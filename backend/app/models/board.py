"""
Kanban boards: a board has ordered lists (columns), a list has ordered cards.

Order is an integer ``position`` that the server renumbers (0, 1, 2, …) whenever something
moves, so clients only send "put it at index N" and never compute positions.
Labels are defined per board (JSON); a card refers to them by id. Checklists and
attachments are small JSON documents on the card.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    # Optional link to a project; the item works the same without one.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    # "gradient:<name>", "color:<name>" or "/api/files/<uuid>"
    background: Mapped[str] = mapped_column(
        String(300), nullable=False, default="gradient:ocean", server_default="gradient:ocean"
    )
    starred: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # [{"id": "a1b2", "name": "Urgent", "color": "red"}]
    labels: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class BoardList(Base):
    __tablename__ = "board_lists"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(
        ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Soft limit shown in the header ("3 / 5"); 0 or null = no limit.
    wip_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BoardCard(Base):
    __tablename__ = "board_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(
        ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    list_id: Mapped[int] = mapped_column(
        ForeignKey("board_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Rich description (editor JSON) and its plain text (search, "has description" badge).
    description: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    description_text: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    label_ids: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # "color:<name>" or "/api/files/<uuid>"
    cover: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # [{"id", "title", "items": [{"id", "text", "done"}]}]
    checklists: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONType, nullable=True)
    # [{"id": "<file uuid>", "name", "kind", "url"}]
    attachments: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONType, nullable=True)
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class CardComment(Base):
    __tablename__ = "card_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(
        ForeignKey("board_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
