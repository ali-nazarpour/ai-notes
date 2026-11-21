"""Accounts and their login sessions."""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _text(length: int) -> Mapped[str]:
    return mapped_column(String(length), nullable=False, default="", server_default="")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False)  # stored lower-cased
    display_name: Mapped[str] = mapped_column(
        String(80), nullable=False, default="", server_default=""
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    theme: Mapped[str] = mapped_column(
        String(10), nullable=False, default="system", server_default="system"
    )
    accent_color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="indigo", server_default="indigo"
    )
    language: Mapped[str] = mapped_column(
        String(5), nullable=False, default="en", server_default="en"
    )
    # Profile details (all optional).
    first_name: Mapped[str] = _text(60)
    last_name: Mapped[str] = _text(60)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    phone: Mapped[str] = _text(30)
    address: Mapped[str] = _text(300)
    bio: Mapped[str] = _text(300)
    # "/api/files/<uuid>" of a square image the user uploaded, or null.
    avatar: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Admins manage users and app-wide settings (email service).
    is_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Disabled accounts cannot sign in.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    email_notifications: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_auth_tokens_token_hash"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Shown in Settings -> Sessions so the user can recognize and revoke devices.
    user_agent: Mapped[str] = _text(300)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
