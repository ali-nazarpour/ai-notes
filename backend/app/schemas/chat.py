"""Ask-AI conversation schemas."""

from datetime import datetime
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import PartialUpdate, strip_required

SourceKind = Literal[
    "notes", "docs", "blog", "projects", "boards", "tasks", "slides", "drive", "learn", "passwords"
]
ALL_SOURCES: tuple[SourceKind, ...] = (
    "notes",
    "docs",
    "projects",
    "boards",
    "tasks",
    "blog",
    "slides",
    "drive",
    "learn",
    "passwords",
)


def _default_sources() -> list[SourceKind]:
    """By default the chatbot reads every part of the workspace."""
    return list(ALL_SOURCES)


class ChatScope(BaseModel):
    """
    Which notes the assistant may read.

    category_ids = None means every category; a list limits it to those categories.
    include_uncategorized controls notes without a category.
    """

    category_ids: list[int] | None = None
    include_uncategorized: bool = True
    # What else the assistant may read besides notes.
    sources: list[SourceKind] = Field(default_factory=_default_sources)

    @field_validator("sources")
    @classmethod
    def unique_sources(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value)) or ["notes"]

    @field_validator("category_ids")
    @classmethod
    def unique_ids(cls, value: list[int] | None) -> list[int] | None:
        return sorted(set(value)) if value is not None else None


class ChatCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    scope: ChatScope = Field(default_factory=ChatScope)


class ChatUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = ("title", "scope")

    title: str | None = Field(default=None, max_length=200)
    scope: ChatScope | None = None


class ChatSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    scope: ChatScope
    created_at: datetime
    updated_at: datetime

    @field_validator("scope", mode="before")
    @classmethod
    def default_scope(cls, value: Any) -> Any:
        return value if value is not None else {}


class ChatSource(BaseModel):
    id: int
    title: str
    kind: str = "note"
    url: str | None = None


class ChatMessageRead(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    sources: list[ChatSource] = Field(default_factory=list)
    cited_note_ids: list[int] = Field(default_factory=list)
    partial: bool = False
    created_at: datetime


class ChatRead(ChatSummary):
    messages: list[ChatMessageRead]


class VaultHint(BaseModel):
    """
    What the chatbot may know about one saved password: never the password itself.
    The browser sends these only while the password vault is unlocked (the server cannot
    decrypt the vault).
    """

    title: str = Field(default="", max_length=200)
    type: str = Field(default="login", max_length=20)
    username: str = Field(default="", max_length=200)
    url: str = Field(default="", max_length=500)
    folder: str = Field(default="", max_length=100)


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    vault: list[VaultHint] = Field(default_factory=list, max_length=1000)
    scope: ChatScope | None = Field(default=None, description="Also updates the conversation.")
    thorough: bool = Field(default=False, description="Let the model reason first (slower).")

    @field_validator("content")
    @classmethod
    def not_blank(cls, value: str) -> str:
        return strip_required(value, "Message")


class ChatReply(BaseModel):
    conversation: ChatSummary
    user_message: ChatMessageRead
    assistant_message: ChatMessageRead
