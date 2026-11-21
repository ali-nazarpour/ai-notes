"""Request and response bodies for the drive, slide decks, language learning and search."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.palette import ColorName

# ---------------------------------------------------------------- drive

DriveView = Literal["folder", "recent", "starred", "trash", "shared", "search"]
DriveSection = Literal["files", "music", "videos", "photos", "documents"]


class DriveItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    is_folder: bool
    section: str = "files"
    project_id: int | None = None
    name: str
    kind: str
    content_type: str
    size: int
    color: str | None
    description: str
    starred: bool
    trashed_at: datetime | None
    link_enabled: bool = False
    url: str | None = None
    owner_name: str = ""
    item_count: int = 0
    shared_count: int = 0
    created_at: datetime
    updated_at: datetime


class DriveCrumb(BaseModel):
    id: int
    name: str


class DriveListing(BaseModel):
    folder: DriveItemRead | None
    path: list[DriveCrumb]
    items: list[DriveItemRead]
    role: str


class DriveUsage(BaseModel):
    used: int
    quota: int  # bytes, 0 = unlimited
    max_file: int  # bytes
    files: int
    folders: int
    by_kind: dict[str, int]
    blocked_extensions: list[str]


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: int | None = None
    color: str | None = Field(default=None, max_length=20)
    section: DriveSection = "files"

    @field_validator("name")
    @classmethod
    def clean(cls, value: str) -> str:
        return _clean_name(value)


class DriveItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    # Moving: the new folder; null = the root. Only applied when "parent_id" is sent.
    parent_id: int | None = None
    starred: bool | None = None
    color: str | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def clean(cls, value: str | None) -> str | None:
        return _clean_name(value) if value is not None else None


class DriveLink(BaseModel):
    enabled: bool


class DriveLinkRead(BaseModel):
    token: str | None


class PublicDrive(BaseModel):
    root: DriveItemRead
    folder: DriveItemRead
    path: list[DriveCrumb]
    items: list[DriveItemRead]
    workspace_name: str


class DriveSettings(BaseModel):
    max_file_mb: int = Field(default=500, ge=1, le=2000)
    workspace_quota_mb: int = Field(default=10240, ge=0, le=10_000_000)
    blocked_extensions: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("blocked_extensions")
    @classmethod
    def clean_ext(cls, value: list[str]) -> list[str]:
        cleaned = []
        for ext in value:
            ext = ext.strip().lower().lstrip(".")
            if ext and ext.isalnum() and len(ext) <= 10 and ext not in cleaned:
                cleaned.append(ext)
        return cleaned


def _clean_name(value: str) -> str:
    name = " ".join(value.replace("/", "-").replace("\\", "-").split()).strip()
    if not name or name in (".", ".."):
        raise ValueError("Enter a name.")
    return name[:255]


# ---------------------------------------------------------------- slides

SlideTheme = Literal[
    "aurora", "midnight", "paper", "sunset", "forest", "ocean", "mono", "candy", "custom"
]
SlideTransition = Literal["none", "fade", "slide", "zoom", "flip"]


class Slide(BaseModel):
    """One slide. Unknown keys are dropped; text fields are limited in length."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(max_length=40)
    layout: Literal[
        "title", "content", "image", "image-text", "quote", "section", "two", "blank"
    ] = "content"
    title: str = Field(default="", max_length=300)
    subtitle: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=5000)
    body2: str = Field(default="", max_length=5000)
    image: str | None = Field(default=None, max_length=500)
    image_fit: Literal["cover", "contain"] = "cover"
    background: str | None = Field(default=None, max_length=300)
    text_color: str | None = Field(default=None, max_length=20)
    align: Literal["start", "center"] = "start"
    notes: str = Field(default="", max_length=5000)
    duration: int = Field(default=0, ge=0, le=600)
    hidden: bool = False


class DeckSummary(BaseModel):
    id: int
    title: str
    description: str
    theme: str
    slide_count: int
    first_slide: Slide | None
    has_music: bool
    starred: bool
    category_id: int | None
    updated_at: datetime
    created_at: datetime


class DeckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    theme: str
    transition: str
    auto_seconds: int
    loop: bool
    music_url: str | None
    music_name: str
    music_volume: int
    slides: list[Slide]
    category_id: int | None
    starred: bool
    role: str = "editor"
    updated_at: datetime
    created_at: datetime


class DeckCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    theme: SlideTheme = "aurora"
    slides: list[Slide] = Field(default_factory=list, max_length=300)
    category_id: int | None = None


class DeckUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    theme: SlideTheme | None = None
    transition: SlideTransition | None = None
    auto_seconds: int | None = Field(default=None, ge=0, le=600)
    loop: bool | None = None
    music_url: str | None = Field(default=None, max_length=300)
    music_name: str | None = Field(default=None, max_length=200)
    music_volume: int | None = Field(default=None, ge=0, le=100)
    slides: list[Slide] | None = Field(default=None, max_length=300)
    category_id: int | None = None
    starred: bool | None = None


class DeckAiRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=500)
    text: str = Field(default="", max_length=12_000)
    count: int = Field(default=6, ge=2, le=15)
    language: Literal["auto", "en", "fa"] = "auto"


class DeckAiResponse(BaseModel):
    title: str
    slides: list[Slide]
    model: str


# ---------------------------------------------------------------- language learning

LangCode = Literal[
    "en", "fa", "de", "fr", "es", "it", "pt", "ar", "tr", "ru", "zh", "ja", "ko", "nl", "hi"
]


class LangDeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    source_lang: LangCode = "en"
    target_lang: LangCode = "fa"
    color: ColorName = "violet"
    icon: str = Field(default="", max_length=16)
    new_per_day: int = Field(default=20, ge=1, le=500)


class LangDeckUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    source_lang: LangCode | None = None
    target_lang: LangCode | None = None
    color: ColorName | None = None
    icon: str | None = Field(default=None, max_length=16)
    new_per_day: int | None = Field(default=None, ge=1, le=500)


class LangDeckRead(BaseModel):
    id: int
    name: str
    description: str
    source_lang: str
    target_lang: str
    color: str
    icon: str
    new_per_day: int
    total: int = 0
    new: int = 0
    learning: int = 0
    due: int = 0
    mastered: int = 0
    created_at: datetime
    updated_at: datetime


class LangCardBase(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(default="", max_length=500)
    pronunciation: str = Field(default="", max_length=200)
    part_of_speech: str = Field(default="", max_length=40)
    example: str = Field(default="", max_length=1000)
    example_translation: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=5000)
    image: str | None = Field(default=None, max_length=300)
    tags: list[str] = Field(default_factory=list, max_length=20)


class LangCardCreate(LangCardBase):
    pass


class LangCardsCreate(BaseModel):
    cards: list[LangCardBase] = Field(min_length=1, max_length=500)


class LangCardUpdate(BaseModel):
    front: str | None = Field(default=None, min_length=1, max_length=500)
    back: str | None = Field(default=None, max_length=500)
    pronunciation: str | None = Field(default=None, max_length=200)
    part_of_speech: str | None = Field(default=None, max_length=40)
    example: str | None = Field(default=None, max_length=1000)
    example_translation: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=5000)
    image: str | None = Field(default=None, max_length=300)
    tags: list[str] | None = Field(default=None, max_length=20)
    starred: bool | None = None
    deck_id: int | None = None


class LangCardRead(LangCardBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deck_id: int
    starred: bool
    state: str
    ease: float
    interval_days: float
    reps: int
    lapses: int
    due_at: datetime | None
    last_review_at: datetime | None
    created_at: datetime
    # Seconds until the card would be due again for grades 1 (again) .. 4 (easy).
    previews: dict[str, float] = Field(default_factory=dict)

    @field_validator("tags", mode="before")
    @classmethod
    def none_tags(cls, value: Any) -> Any:
        return value or []


class ReviewRequest(BaseModel):
    grade: int = Field(ge=1, le=4)


class StudyQueue(BaseModel):
    cards: list[LangCardRead]
    due: int
    new: int


class LangStats(BaseModel):
    total: int
    new: int
    learning: int
    due: int
    mastered: int
    reviews_today: int
    correct_today: int
    streak: int
    best_streak: int
    # The last 120 days: ISO date -> number of reviews.
    days: dict[str, int]


class LangAiCardsRequest(BaseModel):
    topic: str = Field(default="", max_length=500)
    words: str = Field(default="", max_length=6000)
    count: int = Field(default=10, ge=1, le=30)
    level: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    source_lang: LangCode = "en"
    target_lang: LangCode = "fa"


class LangAiCards(BaseModel):
    cards: list[LangCardBase]
    model: str


class LangExplainRequest(BaseModel):
    word: str = Field(min_length=1, max_length=200)
    context: str = Field(default="", max_length=1000)
    source_lang: LangCode = "en"
    target_lang: LangCode = "fa"


class LangExplanation(BaseModel):
    card: LangCardBase
    explanation: str
    model: str


class TranslateLinesRequest(BaseModel):
    lines: list[str] = Field(min_length=1, max_length=400)
    source_lang: LangCode = "en"
    target_lang: LangCode = "fa"
    title: str = Field(default="", max_length=200)

    @field_validator("lines")
    @classmethod
    def limit(cls, value: list[str]) -> list[str]:
        return [line[:500] for line in value]


class TranslatedLines(BaseModel):
    translations: list[str]
    model: str


class SongLine(BaseModel):
    model_config = ConfigDict(extra="ignore")

    time: float | None = Field(default=None, ge=0, le=36_000)
    text: str = Field(default="", max_length=500)
    translation: str = Field(default="", max_length=500)


class SongCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="", max_length=200)
    source_lang: LangCode = "en"
    target_lang: LangCode = "fa"
    deck_id: int | None = None
    media_url: str | None = Field(default=None, max_length=300)
    youtube_url: str | None = Field(default=None, max_length=300)
    cover: str | None = Field(default=None, max_length=300)
    lines: list[SongLine] = Field(default_factory=list, max_length=600)


class SongUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    artist: str | None = Field(default=None, max_length=200)
    source_lang: LangCode | None = None
    target_lang: LangCode | None = None
    deck_id: int | None = None
    media_url: str | None = Field(default=None, max_length=300)
    youtube_url: str | None = Field(default=None, max_length=300)
    cover: str | None = Field(default=None, max_length=300)
    lines: list[SongLine] | None = Field(default=None, max_length=600)


class SongRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    artist: str
    source_lang: str
    target_lang: str
    deck_id: int | None
    media_url: str | None
    youtube_url: str | None
    cover: str | None
    lines: list[SongLine]
    created_at: datetime
    updated_at: datetime

    @field_validator("lines", mode="before")
    @classmethod
    def none_lines(cls, value: Any) -> Any:
        return value or []


# ---------------------------------------------------------------- search


class SearchResult(BaseModel):
    kind: str
    id: int | str
    title: str
    snippet: str
    url: str
    icon: str = ""
    updated_at: datetime | None = None
