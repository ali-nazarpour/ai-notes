"""
Note schemas.

Lists return NoteSummary (no content or body); a single note returns NoteRead.
Updates use PATCH: only the fields that are sent change.
"""

import json
from datetime import datetime
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.note import TITLE_MAX_LENGTH
from app.schemas.common import PartialUpdate

# A cover is either a built-in gradient preset or an uploaded image.
COVER_PATTERN = r"^(gradient:[a-z0-9-]{1,32}|/api/files/[0-9a-fA-F-]{36})$"
NOTE_MAX_CHARS = 2_000_000
BODY_MAX_BYTES = 8_000_000


def _check_body(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    if value.get("type") != "doc":
        raise ValueError("body must be a document with type 'doc'.")
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > BODY_MAX_BYTES:
        raise ValueError(f"body must be at most {BODY_MAX_BYTES} bytes.")
    return value


class NoteSettings(BaseModel):
    """Per-note appearance (Notion-like): font, text size, width, outline, lock."""

    font: Literal["default", "serif", "mono"] = "default"
    small_text: bool = False
    full_width: bool = False
    toc: bool = False
    locked: bool = False


class NoteSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    excerpt: str
    cover: str | None
    category_id: int | None
    is_favorite: bool
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class NoteRead(NoteSummary):
    content: str = Field(description="Plain-text version of the note (used for search and AI).")
    body: dict[str, Any] | None = Field(description="Rich document (TipTap JSON), if any.")
    settings: NoteSettings = Field(default_factory=NoteSettings)
    workspace_id: int | None = None
    # Filled in by the route: the caller's access and who edited last.
    role: Literal["owner", "admin", "editor", "viewer"] = "owner"
    shared: bool = False
    updated_by_name: str = ""

    @field_validator("settings", mode="before")
    @classmethod
    def default_settings(cls, value: Any) -> Any:
        return value or {}


class NoteCreate(BaseModel):
    title: str = Field(default="", max_length=TITLE_MAX_LENGTH, examples=["Meeting notes"])
    content: str = Field(default="", max_length=NOTE_MAX_CHARS)
    body: dict[str, Any] | None = None
    category_id: int | None = None
    cover: str | None = Field(default=None, pattern=COVER_PATTERN, examples=["gradient:aurora"])
    is_favorite: bool = False

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @field_validator("body")
    @classmethod
    def check_body(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return _check_body(value)


class NoteUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = (
        "title",
        "content",
        "is_favorite",
        "settings",
        "workspace_id",
    )

    title: str | None = Field(default=None, max_length=TITLE_MAX_LENGTH)
    content: str | None = Field(default=None, max_length=NOTE_MAX_CHARS)
    body: dict[str, Any] | None = None
    category_id: int | None = None
    cover: str | None = Field(default=None, pattern=COVER_PATTERN)
    is_favorite: bool | None = None
    settings: NoteSettings | None = None
    # Moves the note to another workspace you can edit (its category is cleared).
    workspace_id: int | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("body")
    @classmethod
    def check_body(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return _check_body(value)


class RevisionSummary(BaseModel):
    id: int
    title: str
    chars: int
    excerpt: str
    created_at: datetime
    user_name: str


class RevisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: dict[str, Any] | None
    content: str
    created_at: datetime
