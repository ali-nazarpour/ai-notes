"""Schemas for documentation spaces, blog posts and projects."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.palette import ColorName
from app.schemas.common import PartialUpdate, strip_required
from app.schemas.note import COVER_PATTERN, NOTE_MAX_CHARS, _check_body

Role = Literal["owner", "admin", "editor", "viewer"]
# Alias: some models have a field called "date", which would shadow the type.
Day = date


def _tags(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    seen: dict[str, None] = {}
    for tag in value:
        tag = tag.strip()[:40]
        if tag:
            seen.setdefault(tag, None)
    return list(seen)[:20]


def _title(value: str | None) -> str | None:
    return strip_required(value, "title") if value is not None else None


# ---------------------------------------------------------------- documentation


class DocSpaceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    icon: str = Field(default="📘", max_length=16)
    color: ColorName = "blue"
    category_id: int | None = None
    tags: list[str] = Field(default_factory=list, max_length=20)
    template: Literal["blank", "guide", "api", "handbook"] = "guide"

    @field_validator("title")
    @classmethod
    def check_title(cls, v: Any) -> Any:
        return _title(v)

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v: Any) -> Any:
        return _tags(v)


class DocSpaceUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = (
        "title",
        "description",
        "icon",
        "color",
        "tags",
        "version",
        "starred",
    )

    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    icon: str | None = Field(default=None, max_length=16)
    color: ColorName | None = None
    cover: str | None = Field(default=None, pattern=COVER_PATTERN)
    category_id: int | None = None
    tags: list[str] | None = Field(default=None, max_length=20)
    version: str | None = Field(default=None, max_length=30)
    starred: bool | None = None

    @field_validator("title")
    @classmethod
    def check_title(cls, v: Any) -> Any:
        return _title(v)

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v: Any) -> Any:
        return _tags(v)


class DocSpaceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    icon: str
    color: str
    cover: str | None
    category_id: int | None
    tags: list[str]
    version: str
    starred: bool
    page_count: int = 0
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def list_default(cls, value: Any) -> Any:
        return value or []


class DocPageNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    title: str
    icon: str
    position: int
    updated_at: datetime


class DocSpaceRead(DocSpaceSummary):
    pages: list[DocPageNode]
    role: Role = "owner"
    shared: bool = False


class DocPageRead(DocPageNode):
    space_id: int
    body: dict[str, Any] | None
    content: str
    created_at: datetime
    updated_by_name: str = ""


class DocPageCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    icon: str = Field(default="", max_length=16)
    parent_id: int | None = None
    index: int | None = Field(default=None, ge=0)
    body: dict[str, Any] | None = None
    content: str = Field(default="", max_length=NOTE_MAX_CHARS)

    @field_validator("body")
    @classmethod
    def check_body(cls, v: Any) -> Any:
        return _check_body(v)


class DocPageUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = ("title", "icon", "content")

    title: str | None = Field(default=None, max_length=200)
    icon: str | None = Field(default=None, max_length=16)
    body: dict[str, Any] | None = None
    content: str | None = Field(default=None, max_length=NOTE_MAX_CHARS)

    @field_validator("body")
    @classmethod
    def check_body(cls, v: Any) -> Any:
        return _check_body(v)


class DocPageMove(BaseModel):
    parent_id: int | None = None
    index: int = Field(ge=0)


class DocPagesBatch(BaseModel):
    parent_id: int | None = None
    pages: list[DocPageCreate] = Field(min_length=1, max_length=30)


class SearchHit(BaseModel):
    id: int
    title: str
    snippet: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    thorough: bool = False


class AskSource(BaseModel):
    id: int
    title: str
    url: str


class AskResponse(BaseModel):
    answer: str
    sources: list[AskSource]
    cited_ids: list[int]
    partial: bool
    model: str


# ---------------------------------------------------------------- blog

PostStatus = Literal["draft", "published"]
SLUG_PATTERN = r"^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$"


class PostCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    category_id: int | None = None


class PostUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = (
        "title",
        "slug",
        "excerpt",
        "content",
        "tags",
        "status",
        "seo_title",
        "seo_description",
        "featured",
    )

    title: str | None = Field(default=None, max_length=200)
    slug: str | None = Field(default=None, min_length=1, max_length=120, pattern=SLUG_PATTERN)
    excerpt: str | None = Field(default=None, max_length=500)
    body: dict[str, Any] | None = None
    content: str | None = Field(default=None, max_length=NOTE_MAX_CHARS)
    cover: str | None = Field(default=None, pattern=COVER_PATTERN)
    tags: list[str] | None = Field(default=None, max_length=20)
    category_id: int | None = None
    status: PostStatus | None = None
    published_at: datetime | None = None
    seo_title: str | None = Field(default=None, max_length=120)
    seo_description: str | None = Field(default=None, max_length=300)
    featured: bool | None = None

    @field_validator("body")
    @classmethod
    def check_body(cls, v: Any) -> Any:
        return _check_body(v)

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v: Any) -> Any:
        return _tags(v)


class PostSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    excerpt: str
    cover: str | None
    tags: list[str]
    category_id: int | None
    status: PostStatus
    published_at: datetime | None
    featured: bool
    views: int
    reading_minutes: int = 1
    author_name: str = ""
    author_avatar: str | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def list_default(cls, value: Any) -> Any:
        return value or []


class PostRead(PostSummary):
    body: dict[str, Any] | None
    content: str
    seo_title: str
    seo_description: str


class PublicBlog(BaseModel):
    workspace_name: str
    workspace_icon: str
    description: str
    posts: list[PostSummary]


# ---------------------------------------------------------------- projects

ProjectStatus = Literal["idea", "planning", "active", "on_hold", "completed", "cancelled"]
Priority = Literal["low", "medium", "high", "urgent"]
ProjectKind = Literal["software", "design", "marketing", "research", "event", "business", "general"]


class _Item(BaseModel):
    id: str = Field(min_length=1, max_length=20)


class Milestone(_Item):
    title: str = Field(max_length=200)
    date: Day | None = None
    done: bool = False


class Expense(_Item):
    title: str = Field(max_length=200)
    amount: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    date: Day | None = None
    category: str = Field(default="", max_length=40)


class Member(_Item):
    name: str = Field(max_length=100)
    role: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=254)
    user_id: int | None = None


class Repository(_Item):
    url: str = Field(max_length=500, pattern=r"^https?://")
    name: str = Field(default="", max_length=120)
    branch: str = Field(default="", max_length=80)
    provider: str = Field(default="", max_length=20)


class Link(_Item):
    url: str = Field(max_length=500, pattern=r"^https?://")
    title: str = Field(default="", max_length=120)
    kind: str = Field(default="website", max_length=20)


class ProjectFile(_Item):
    url: str = Field(max_length=80, pattern=r"^/api/files/[0-9a-fA-F-]{36}$")
    name: str = Field(max_length=255)
    size: int = Field(ge=0)
    content_type: str = Field(default="", max_length=100)
    folder: str = Field(default="", max_length=60)
    uploaded_at: datetime | None = None


class ProjectNote(_Item):
    text: str = Field(max_length=2000)
    color: str = Field(default="amber", max_length=20)
    pinned: bool = False


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    summary: str = Field(default="", max_length=300)
    kind: ProjectKind = "general"
    status: ProjectStatus = "planning"
    color: ColorName = "indigo"
    icon: str = Field(default="🚀", max_length=16)
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: Any) -> Any:
        return _title(v)


class ProjectUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = (
        "name",
        "summary",
        "status",
        "priority",
        "kind",
        "color",
        "icon",
        "currency",
        "client",
        "tags",
        "members",
        "milestones",
        "expenses",
        "repositories",
        "links",
        "files",
        "notes",
        "starred",
        "archived",
        "description_text",
    )

    name: str | None = Field(default=None, min_length=1, max_length=120)
    summary: str | None = Field(default=None, max_length=300)
    description: dict[str, Any] | None = None
    description_text: str | None = Field(default=None, max_length=200_000)
    status: ProjectStatus | None = None
    priority: Priority | None = None
    kind: ProjectKind | None = None
    color: ColorName | None = None
    icon: str | None = Field(default=None, max_length=16)
    cover: str | None = Field(default=None, pattern=COVER_PATTERN)
    start_date: date | None = None
    end_date: date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    budget: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    currency: str | None = Field(default=None, min_length=1, max_length=8)
    client: str | None = Field(default=None, max_length=120)
    category_id: int | None = None
    tags: list[str] | None = Field(default=None, max_length=20)
    board_id: int | None = None
    doc_space_id: int | None = None
    members: list[Member] | None = Field(default=None, max_length=100)
    milestones: list[Milestone] | None = Field(default=None, max_length=200)
    expenses: list[Expense] | None = Field(default=None, max_length=500)
    repositories: list[Repository] | None = Field(default=None, max_length=30)
    links: list[Link] | None = Field(default=None, max_length=50)
    files: list[ProjectFile] | None = Field(default=None, max_length=500)
    notes: list[ProjectNote] | None = Field(default=None, max_length=100)
    starred: bool | None = None
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: Any) -> Any:
        return _title(v)

    @field_validator("description")
    @classmethod
    def check_description(cls, v: Any) -> Any:
        return _check_body(v)

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v: Any) -> Any:
        return _tags(v)


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    summary: str
    status: ProjectStatus
    priority: Priority
    kind: ProjectKind
    color: str
    icon: str
    cover: str | None
    start_date: date | None
    end_date: date | None
    progress: int
    budget: Decimal | None
    spent: Decimal = Decimal(0)
    currency: str
    client: str
    category_id: int | None
    tags: list[str]
    member_count: int = 0
    milestone_count: int = 0
    milestones_done: int = 0
    starred: bool
    archived: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def list_default(cls, value: Any) -> Any:
        return value or []


class ProjectRead(ProjectSummary):
    description: dict[str, Any] | None
    description_text: str
    manual_progress: int | None
    board_id: int | None
    doc_space_id: int | None
    members: list[Member]
    milestones: list[Milestone]
    expenses: list[Expense]
    repositories: list[Repository]
    links: list[Link]
    files: list[ProjectFile]
    notes: list[ProjectNote]
    role: Role = "owner"
    shared: bool = False
