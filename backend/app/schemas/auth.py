"""Account schemas. UserRead is the only user shape that leaves the server (no password hash)."""

import re
from datetime import date, datetime
from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.palette import ColorName
from app.schemas.common import PartialUpdate

Theme = Literal["system", "light", "dark"]
Language = Literal["en", "fa"]

# Deliberately simple: the app does not verify addresses by mail.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^[0-9+()\-\s]{0,30}$")
AVATAR_PATTERN = r"^/api/files/[0-9a-fA-F-]{36}$"


def _check_email(value: str) -> str:
    value = value.strip().lower()
    if not _EMAIL.match(value):
        raise ValueError("Enter a valid email address.")
    return value


class RegisterRequest(BaseModel):
    email: str = Field(max_length=254, examples=["ali@example.com"])
    password: str = Field(min_length=8, max_length=128, examples=["correct horse battery"])
    display_name: str = Field(default="", max_length=80, examples=["Ali"])
    language: Language = "en"
    # Lets someone sign up while registration is closed, with the invited email address.
    invite_token: str | None = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        return _check_email(value)

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()


class LoginRequest(BaseModel):
    email: str = Field(max_length=254, examples=["ali@example.com"])
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize(cls, value: str) -> str:
        return value.strip().lower()


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    theme: Theme
    accent_color: ColorName
    language: Language
    first_name: str
    last_name: str
    birth_date: date | None
    phone: str
    address: str
    bio: str
    avatar: str | None
    is_admin: bool = False
    email_notifications: bool = True
    created_at: datetime


class AuthResponse(BaseModel):
    """Returned by register and login."""

    token: str = Field(description="Send it as 'Authorization: Bearer <token>'.")
    user: UserRead


class UserUpdate(PartialUpdate):
    """
    PATCH /api/auth/me: only the fields that are sent are changed.
    Changing the email also requires ``current_password``.
    """

    NOT_NULLABLE: ClassVar[tuple[str, ...]] = (
        "display_name",
        "theme",
        "accent_color",
        "language",
        "email",
        "first_name",
        "last_name",
        "phone",
        "address",
        "bio",
        "email_notifications",
    )

    display_name: str | None = Field(default=None, max_length=80)
    theme: Theme | None = None
    accent_color: ColorName | None = None
    language: Language | None = None
    email: str | None = Field(default=None, max_length=254)
    current_password: str | None = Field(default=None, max_length=128)
    first_name: str | None = Field(default=None, max_length=60)
    last_name: str | None = Field(default=None, max_length=60)
    birth_date: date | None = None
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=300)
    bio: str | None = Field(default=None, max_length=300)
    avatar: str | None = Field(default=None, pattern=AVATAR_PATTERN)
    email_notifications: bool | None = None

    @field_validator("display_name", "first_name", "last_name", "address", "bio")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str | None) -> str | None:
        return _check_email(value) if value is not None else None

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not _PHONE.match(value):
            raise ValueError("Use digits, spaces and + ( ) - only.")
        return value

    @field_validator("birth_date")
    @classmethod
    def check_birth_date(cls, value: date | None) -> date | None:
        if value is not None and not date(1900, 1, 1) <= value <= date.today():
            raise ValueError("Enter a date between 1900 and today.")
        return value


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_agent: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime
    current: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def normalize(cls, value: str) -> str:
        return value.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


class PublicConfig(BaseModel):
    """What the sign-in screen needs to know before anyone is signed in."""

    app_name: str
    allow_registration: bool
    email_enabled: bool
