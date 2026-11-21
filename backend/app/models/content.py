"""
Documentation spaces, blog posts, projects and revision history.

Rich text is stored like notes: ``body`` (editor JSON, source of truth) plus a plain-text
copy used for search and the AI.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType


def _ws() -> Mapped[int]:
    return mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )


def _author() -> Mapped[int | None]:
    return mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def _category() -> Mapped[int | None]:
    return mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)


def _str(length: int) -> Mapped[str]:
    return mapped_column(String(length), nullable=False, default="", server_default="")


def _flag(default: bool = False) -> Mapped[bool]:
    return mapped_column(
        Boolean, nullable=False, default=default, server_default="true" if default else "false"
    )


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _updated() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


def _json_list() -> Mapped[list[Any] | None]:
    return mapped_column(JSONType, nullable=True)


class DocSpace(Base):
    """A documentation set (e.g. "React JS"), made of nested pages."""

    __tablename__ = "doc_spaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    user_id: Mapped[int | None] = _author()
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = _str(500)
    icon: Mapped[str] = _str(16)
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="blue", server_default="blue"
    )
    cover: Mapped[str | None] = mapped_column(String(300), nullable=True)
    category_id: Mapped[int | None] = _category()
    # Optional link to a project; the item works the same without one.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    tags: Mapped[list[Any] | None] = _json_list()
    version: Mapped[str] = _str(30)
    starred: Mapped[bool] = _flag()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class DocPage(Base):
    __tablename__ = "doc_pages"

    id: Mapped[int] = mapped_column(primary_key=True)
    space_id: Mapped[int] = mapped_column(
        ForeignKey("doc_spaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("doc_pages.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = _str(200)
    icon: Mapped[str] = _str(16)
    body: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_by: Mapped[int | None] = _author()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class BlogPost(Base):
    __tablename__ = "blog_posts"
    __table_args__ = (UniqueConstraint("workspace_id", "slug", name="uq_blog_posts_slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    user_id: Mapped[int | None] = _author()
    title: Mapped[str] = _str(200)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    excerpt: Mapped[str] = _str(500)
    body: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    cover: Mapped[str | None] = mapped_column(String(300), nullable=True)
    tags: Mapped[list[Any] | None] = _json_list()
    category_id: Mapped[int | None] = _category()
    # draft | published (visible once published_at has passed, so it can be scheduled)
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="draft", server_default="draft"
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    seo_title: Mapped[str] = _str(120)
    seo_description: Mapped[str] = _str(300)
    featured: Mapped[bool] = _flag()
    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Project(Base):
    """
    A project with its schedule, budget, team, links and files. Lists that belong only
    to one project (milestones, expenses, members, links, files, notes) are JSON.
    """

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    user_id: Mapped[int | None] = _author()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    summary: Mapped[str] = _str(300)
    description: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    description_text: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    # idea | planning | active | on_hold | completed | cancelled
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="planning", server_default="planning"
    )
    priority: Mapped[str] = mapped_column(
        String(8), nullable=False, default="medium", server_default="medium"
    )
    # software | design | marketing | research | event | general
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="general", server_default="general"
    )
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="indigo", server_default="indigo"
    )
    icon: Mapped[str] = _str(16)
    cover: Mapped[str | None] = mapped_column(String(300), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 0-100; null = computed from milestones
    progress: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    currency: Mapped[str] = mapped_column(
        String(8), nullable=False, default="USD", server_default="USD"
    )
    client: Mapped[str] = _str(120)
    category_id: Mapped[int | None] = _category()
    tags: Mapped[list[Any] | None] = _json_list()
    board_id: Mapped[int | None] = mapped_column(
        ForeignKey("boards.id", ondelete="SET NULL"), nullable=True
    )
    doc_space_id: Mapped[int | None] = mapped_column(
        ForeignKey("doc_spaces.id", ondelete="SET NULL"), nullable=True
    )
    members: Mapped[list[Any] | None] = _json_list()
    milestones: Mapped[list[Any] | None] = _json_list()
    expenses: Mapped[list[Any] | None] = _json_list()
    repositories: Mapped[list[Any] | None] = _json_list()
    links: Mapped[list[Any] | None] = _json_list()
    files: Mapped[list[Any] | None] = _json_list()
    notes: Mapped[list[Any] | None] = _json_list()
    starred: Mapped[bool] = _flag()
    archived: Mapped[bool] = _flag()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Revision(Base):
    """A saved earlier version of a note, documentation page or blog post."""

    __tablename__ = "revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # note|doc_page|post
    item_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = _str(200)
    body: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    user_id: Mapped[int | None] = _author()
    created_at: Mapped[datetime] = _created()
