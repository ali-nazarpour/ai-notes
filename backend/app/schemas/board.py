"""Kanban board schemas."""

from datetime import date, datetime
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.palette import ColorName
from app.schemas.common import PartialUpdate, strip_required

FILE_URL = r"/api/files/[0-9a-fA-F-]{36}"
BACKGROUND_PATTERN = rf"^(gradient:[a-z0-9-]{{1,32}}|color:[a-z]{{1,20}}|{FILE_URL})$"
CARD_COVER_PATTERN = rf"^(color:[a-z]{{1,20}}|{FILE_URL})$"
_ID = r"^[A-Za-z0-9_-]{1,24}$"

Template = Literal["blank", "kanban", "project", "weekly", "personal"]
SortBy = Literal["due", "title", "newest", "oldest"]


class Label(BaseModel):
    id: str = Field(pattern=_ID)
    name: str = Field(default="", max_length=40)
    color: ColorName


class ChecklistItem(BaseModel):
    id: str = Field(pattern=_ID)
    text: str = Field(max_length=500)
    done: bool = False


class Checklist(BaseModel):
    id: str = Field(pattern=_ID)
    title: str = Field(max_length=200)
    items: list[ChecklistItem] = Field(default_factory=list, max_length=200)


class Attachment(BaseModel):
    id: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    name: str = Field(default="", max_length=255)
    kind: Literal["image", "video", "audio", "file"]
    url: str = Field(pattern=rf"^{FILE_URL}$")

    @model_validator(mode="after")
    def url_matches_id(self) -> "Attachment":
        if not self.url.endswith(self.id):
            raise ValueError("The attachment url must point to its id.")
        return self


# --- Boards ---


class BoardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    background: str = Field(default="gradient:ocean", pattern=BACKGROUND_PATTERN)
    template: Template = "kanban"

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return strip_required(value, "title")


class BoardUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = (
        "title",
        "background",
        "starred",
        "description",
        "labels",
    )

    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=5000)
    background: str | None = Field(default=None, pattern=BACKGROUND_PATTERN)
    starred: bool | None = None
    labels: list[Label] | None = Field(default=None, max_length=30)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        return strip_required(value, "title") if value is not None else None


class BoardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    background: str
    starred: bool
    list_count: int = 0
    card_count: int = 0
    created_at: datetime
    updated_at: datetime


# --- Lists ---


class ListCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    index: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return strip_required(value, "title")


class ListUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = ("title", "index")

    title: str | None = Field(default=None, min_length=1, max_length=100)
    color: ColorName | None = None
    wip_limit: int | None = Field(default=None, ge=0, le=999)
    index: int | None = Field(default=None, ge=0, description="New position among the lists.")

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        return strip_required(value, "title") if value is not None else None


class ListSort(BaseModel):
    by: SortBy


# --- Cards ---


class CardCreate(BaseModel):
    list_id: int
    title: str = Field(min_length=1, max_length=300)
    index: int | None = Field(default=None, ge=0, description="Default: the end of the list.")

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return strip_required(value, "title")


class CardUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = (
        "title",
        "description_text",
        "label_ids",
        "due_done",
        "checklists",
        "attachments",
        "archived",
        "list_id",
        "index",
    )

    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: dict[str, Any] | None = None
    description_text: str | None = Field(default=None, max_length=200_000)
    label_ids: list[str] | None = Field(default=None, max_length=30)
    start_date: date | None = None
    due_date: date | None = None
    due_done: bool | None = None
    cover: str | None = Field(default=None, pattern=CARD_COVER_PATTERN)
    checklists: list[Checklist] | None = Field(default=None, max_length=20)
    attachments: list[Attachment] | None = Field(default=None, max_length=50)
    archived: bool | None = None
    list_id: int | None = Field(default=None, description="Move to this list.")
    index: int | None = Field(default=None, ge=0, description="Position in the (new) list.")

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        return strip_required(value, "title") if value is not None else None

    @field_validator("description")
    @classmethod
    def check_doc(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is not None and value.get("type") != "doc":
            raise ValueError("description must be an editor document.")
        return value


class CardCopy(BaseModel):
    list_id: int | None = None
    index: int | None = Field(default=None, ge=0)
    title: str | None = Field(default=None, min_length=1, max_length=300)


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return strip_required(value, "text")


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    created_at: datetime


class CardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    list_id: int
    title: str
    position: int
    label_ids: list[str]
    start_date: date | None
    due_date: date | None
    due_done: bool
    cover: str | None
    archived: bool
    has_description: bool
    checklist_done: int
    checklist_total: int
    comment_count: int
    attachment_count: int
    created_at: datetime
    updated_at: datetime


class CardRead(CardSummary):
    description: dict[str, Any] | None
    description_text: str
    checklists: list[Checklist]
    attachments: list[Attachment]
    comments: list[CommentRead]


class ListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    position: int
    color: ColorName | None
    wip_limit: int | None
    cards: list[CardSummary] = Field(default_factory=list)


class BoardRead(BoardSummary):
    labels: list[Label]
    lists: list[ListRead]
