"""Workspace, member, invite and share schemas."""

from datetime import datetime
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.palette import ColorName
from app.schemas.auth import Theme, _check_email
from app.schemas.common import PartialUpdate, strip_required

Role = Literal["owner", "admin", "editor", "viewer"]
InviteRole = Literal["admin", "editor", "viewer"]
ShareRole = Literal["editor", "viewer"]
ShareKind = Literal["note", "board", "doc", "project", "drive", "deck"]
FontStyle = Literal["default", "serif", "mono"]


class WorkspaceSettings(BaseModel):
    """Per-workspace preferences. Unknown keys are dropped."""

    blog_public: bool = False
    ai_enabled: bool = True
    default_font: FontStyle = "default"
    full_width: bool = False
    week_start: Literal["auto", "saturday", "sunday", "monday"] = "auto"


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = Field(default="", max_length=16)
    description: str = Field(default="", max_length=300)
    accent_color: ColorName | None = None
    theme: Theme | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        return strip_required(value, "name")


class WorkspaceUpdate(PartialUpdate):
    NOT_NULLABLE: ClassVar[tuple[str, ...]] = ("name", "icon", "description", "settings")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    icon: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=300)
    accent_color: ColorName | None = None
    theme: Theme | None = None
    cover: str | None = Field(default=None, max_length=300)
    settings: WorkspaceSettings | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str | None) -> str | None:
        return strip_required(value, "name") if value is not None else None


class WorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    icon: str
    description: str
    accent_color: ColorName | None
    theme: Theme | None
    cover: str | None
    settings: WorkspaceSettings
    owner_id: int
    role: Role = "viewer"
    member_count: int = 1
    created_at: datetime

    @field_validator("settings", mode="before")
    @classmethod
    def default_settings(cls, value: Any) -> Any:
        return value or {}


class MemberRead(BaseModel):
    id: int
    user_id: int
    email: str
    name: str
    avatar: str | None
    role: Role
    joined_at: datetime


class MemberUpdate(BaseModel):
    role: InviteRole


class InviteCreate(BaseModel):
    email: str = Field(max_length=254)
    role: InviteRole = "editor"
    message: str = Field(default="", max_length=500)

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        return _check_email(value)


class InviteRead(BaseModel):
    id: int
    workspace_id: int
    workspace_name: str
    workspace_icon: str
    email: str
    role: InviteRole
    invited_by: str
    created_at: datetime
    expires_at: datetime


class InviteCreated(InviteRead):
    link: str
    email_status: Literal["sent", "failed", "skipped"]


class InviteAccept(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ShareCreate(BaseModel):
    kind: ShareKind
    item_id: int
    email: str = Field(max_length=254)
    role: ShareRole = "viewer"

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        return _check_email(value)


class ShareRead(BaseModel):
    id: int
    kind: ShareKind
    item_id: int
    user_id: int
    email: str
    name: str
    avatar: str | None
    role: ShareRole
    created_at: datetime


class SharedItem(BaseModel):
    share_id: int
    kind: ShareKind
    item_id: int
    title: str
    role: ShareRole
    workspace_id: int
    workspace_name: str
    shared_by: str
    url: str
    created_at: datetime


class ShareUpdate(BaseModel):
    role: ShareRole
