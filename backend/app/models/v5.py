"""
Drive (files and folders), slide decks and language learning (flashcards, songs).

- ``drive_items``: a tree of folders and files per workspace. A file row points at a
  ``files`` row (the bytes live in object storage). Trash is a timestamp; children of a
  trashed folder are hidden with it. ``link_token`` is set while a public link is on.
- ``slide_decks``: a presentation. Slides are a JSON list (layout, text, image,
  background, notes, duration); music plays while the deck is shown.
- ``lang_decks`` / ``lang_cards`` / ``lang_reviews``: flashcards with spaced repetition
  (SM-2 style: ease, interval, due date) and a review log for streaks and statistics.
- ``lang_songs``: a song with timed lyric lines and their translations.
"""

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType


def _ws() -> Mapped[int]:
    return mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )


def _user() -> Mapped[int | None]:
    return mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def _str(length: int) -> Mapped[str]:
    return mapped_column(String(length), nullable=False, default="", server_default="")


def _flag() -> Mapped[bool]:
    return mapped_column(Boolean, nullable=False, default=False, server_default="false")


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _updated() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DriveItem(Base):
    __tablename__ = "drive_items"
    __table_args__ = (UniqueConstraint("link_token", name="uq_drive_items_link_token"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("drive_items.id", ondelete="CASCADE"), nullable=True, index=True
    )
    is_folder: Mapped[bool] = _flag()
    # files (My Drive) | music | videos | photos | documents: separate libraries
    section: Mapped[str] = mapped_column(
        String(12), nullable=False, default="files", server_default="files", index=True
    )
    # Optional link to a project; the item works the same without one.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("files.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # image | video | audio | file (from the file's first bytes); "" for folders
    kind: Mapped[str] = _str(10)
    content_type: Mapped[str] = _str(100)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str] = _str(500)
    starred: Mapped[bool] = _flag()
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    link_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    owner_id: Mapped[int | None] = _user()
    updated_by: Mapped[int | None] = _user()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class SlideDeck(Base):
    __tablename__ = "slide_decks"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    user_id: Mapped[int | None] = _user()
    title: Mapped[str] = _str(200)
    description: Mapped[str] = _str(500)
    theme: Mapped[str] = mapped_column(
        String(20), nullable=False, default="aurora", server_default="aurora"
    )
    transition: Mapped[str] = mapped_column(
        String(10), nullable=False, default="fade", server_default="fade"
    )
    # Seconds per slide when playing automatically; 0 = advance by hand.
    auto_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    loop: Mapped[bool] = _flag()
    music_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    music_name: Mapped[str] = _str(200)
    music_volume: Mapped[int] = mapped_column(
        Integer, nullable=False, default=70, server_default="70"
    )
    slides: Mapped[list[Any] | None] = mapped_column(JSONType, nullable=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    # Optional link to a project; the item works the same without one.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    starred: Mapped[bool] = _flag()
    updated_by: Mapped[int | None] = _user()
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class LangDeck(Base):
    __tablename__ = "lang_decks"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    user_id: Mapped[int | None] = _user()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = _str(500)
    source_lang: Mapped[str] = mapped_column(
        String(8), nullable=False, default="en", server_default="en"
    )
    target_lang: Mapped[str] = mapped_column(
        String(8), nullable=False, default="fa", server_default="fa"
    )
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="violet", server_default="violet"
    )
    icon: Mapped[str] = _str(16)
    # New cards introduced per day in study sessions.
    new_per_day: Mapped[int] = mapped_column(
        Integer, nullable=False, default=20, server_default="20"
    )
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class LangCard(Base):
    __tablename__ = "lang_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    deck_id: Mapped[int] = mapped_column(
        ForeignKey("lang_decks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    front: Mapped[str] = mapped_column(String(500), nullable=False)
    back: Mapped[str] = _str(500)
    pronunciation: Mapped[str] = _str(200)
    part_of_speech: Mapped[str] = _str(40)
    example: Mapped[str] = _str(1000)
    example_translation: Mapped[str] = _str(1000)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    image: Mapped[str | None] = mapped_column(String(300), nullable=True)
    tags: Mapped[list[Any] | None] = mapped_column(JSONType, nullable=True)
    starred: Mapped[bool] = _flag()
    # new | learning | review
    state: Mapped[str] = mapped_column(
        String(10), nullable=False, default="new", server_default="new"
    )
    ease: Mapped[float] = mapped_column(Float, nullable=False, default=2.5, server_default="2.5")
    interval_days: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, server_default="0"
    )
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class LangReview(Base):
    __tablename__ = "lang_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    user_id: Mapped[int | None] = _user()
    card_id: Mapped[int] = mapped_column(
        ForeignKey("lang_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    grade: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 again .. 4 easy
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class LangSong(Base):
    __tablename__ = "lang_songs"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = _ws()
    user_id: Mapped[int | None] = _user()
    deck_id: Mapped[int | None] = mapped_column(
        ForeignKey("lang_decks.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    artist: Mapped[str] = _str(200)
    source_lang: Mapped[str] = mapped_column(
        String(8), nullable=False, default="en", server_default="en"
    )
    target_lang: Mapped[str] = mapped_column(
        String(8), nullable=False, default="fa", server_default="fa"
    )
    # An uploaded audio/video file (/api/files/...) or a YouTube link.
    media_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    youtube_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    cover: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # [{"time": seconds | null, "text": "...", "translation": "..."}]
    lines: Mapped[list[Any] | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Alarm(Base):
    """
    A personal reminder. The browser computes when it rings (in the user's own time zone)
    from the time, the date (one-time alarms) and the repeat rule, and reports each ring
    back (``last_fired_at``) so it rings once even with several tabs or devices open.
    """

    __tablename__ = "alarms"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    note: Mapped[str] = _str(1000)
    time: Mapped[str] = mapped_column(String(5), nullable=False)  # "HH:MM", local time
    date: Mapped[date_type | None] = mapped_column(Date, nullable=True)  # one-time alarms
    # once | daily | weekdays | weekly | monthly
    repeat: Mapped[str] = mapped_column(
        String(10), nullable=False, default="once", server_default="once"
    )
    # For "weekly": days of the week, 0 = Sunday ... 6 = Saturday.
    weekdays: Mapped[list[Any] | None] = mapped_column(JSONType, nullable=True)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    sound: Mapped[str] = mapped_column(
        String(20), nullable=False, default="chime", server_default="chime"
    )
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="amber", server_default="amber"
    )
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
