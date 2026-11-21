"""
Global search: one query over every section of the workspace — notes, tasks, boards and
cards, documents, blog posts, projects, drive, presentations, flashcards, songs,
categories, chatbot conversations — plus the user's own alarms.

Matching:
- The query is split into words; every word must appear somewhere in the item (title or
  text), in any order.
- Text is compared case-insensitively, with Arabic and Persian letter variants (ي/ی,
  ك/ک), zero-width joiners and kashida ignored, in SQL and in Python alike.
Ranking: an exact title, then a title that starts with the query, contains it, or contains
its words, then matches in the text; newer items first on ties. Sections are ordered by
their best result, so the most relevant section comes first.
"""

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Alarm,
    BlogPost,
    Board,
    BoardCard,
    Category,
    ChatConversation,
    ChatMessage,
    DocPage,
    DocSpace,
    DriveItem,
    LangCard,
    LangDeck,
    LangSong,
    Note,
    Project,
    SlideDeck,
    Task,
)
from app.schemas.v5 import SearchResult
from app.services.notes import escape_like

_REPLACE = (
    ("\u064a", "\u06cc"),
    ("\u0649", "\u06cc"),
    ("\u0643", "\u06a9"),
    ("\u200c", ""),
    ("\u0640", ""),
)
_SPACES = re.compile(r"\s+")


def normalize(text: str | None) -> str:
    value = (text or "").lower()
    for old, new in _REPLACE:
        value = value.replace(old, new)
    return _SPACES.sub(" ", value).strip()


def _sql_norm(column: Any) -> Any:
    expression = func.lower(func.coalesce(column, ""))
    for old, new in _REPLACE:
        expression = func.replace(expression, old, new)
    return expression


def query_words(q: str) -> list[str]:
    words: list[str] = []
    for word in normalize(q).split(" "):
        if word and word not in words:
            words.append(word)
    return words[:8]


def matches_all(words: list[str], *columns: Any) -> Any:
    """Every word appears in at least one of the columns."""
    return and_(
        *(
            or_(*(_sql_norm(c).like(f"%{escape_like(w)}%", escape="\\") for c in columns))
            for w in words
        )
    )


def snippet(text: str, words: list[str], width: int = 70) -> str:
    flat = " ".join((text or "").split())
    lowered = normalize(flat)
    positions = [lowered.find(w) for w in words if lowered.find(w) >= 0]
    if not positions or len(lowered) != len(flat.lower()):
        # Normalizing removed characters, so positions may shift; search the raw text too.
        positions = [flat.lower().find(w) for w in words if flat.lower().find(w) >= 0] or positions
    index = min(positions) if positions else -1
    if index < 0:
        return flat[: width * 2]
    start = max(0, index - width)
    end = min(len(flat), index + width + 20)
    return ("…" if start else "") + flat[start:end] + ("…" if end < len(flat) else "")


def score(title: str, text: str, full: str, words: list[str]) -> int:
    name = normalize(title)
    points = 0
    if name == full:
        points += 100
    elif name.startswith(full):
        points += 60
    elif full in name:
        points += 40
    points += 10 * sum(1 for w in words if w in name)
    if full in normalize(text):
        points += 5
    return points


@dataclass
class _Hit:
    result: SearchResult
    score: int
    when: float


def search(
    db: Session, ws_id: int, q: str, per_kind: int = 6, user_id: int | None = None
) -> list[SearchResult]:
    words = query_words(q)
    if not words:
        return []
    full = " ".join(words)
    fetch = per_kind * 4
    groups: dict[str, list[_Hit]] = {}

    def add(
        kind: str,
        rows: Iterable[Any],
        make: Callable[[Any], tuple[int | str, str, str, str, datetime | None, str]],
    ) -> None:
        hits = groups.setdefault(kind, [])
        for row in rows:
            item_id, title, text, url, updated, icon = make(row)
            hits.append(
                _Hit(
                    SearchResult(
                        kind=kind,
                        id=item_id,
                        title=title,
                        snippet=snippet(text or title, words),
                        url=url,
                        icon=icon,
                        updated_at=updated,
                    ),
                    score(title, text, full, words),
                    updated.timestamp() if updated else 0.0,
                )
            )

    def text_match(*texts: str | None) -> bool:
        joined = normalize(" ".join(t or "" for t in texts))
        return all(w in joined for w in words)

    add(
        "note",
        db.scalars(
            select(Note)
            .where(
                Note.workspace_id == ws_id,
                Note.deleted_at.is_(None),
                matches_all(words, Note.title, Note.content),
            )
            .order_by(Note.updated_at.desc())
            .limit(fetch)
        ),
        lambda n: (n.id, n.title, n.content, f"/notes/{n.id}", n.updated_at, ""),
    )
    add(
        "task",
        db.scalars(
            select(Task)
            .where(Task.workspace_id == ws_id, matches_all(words, Task.title))
            .order_by(Task.is_done, Task.id.desc())
            .limit(fetch)
        ),
        lambda t: (t.id, t.title, "", f"/tasks?task={t.id}", None, "✅" if t.is_done else ""),
    )
    add(
        "board",
        db.scalars(
            select(Board)
            .where(Board.workspace_id == ws_id, matches_all(words, Board.title, Board.description))
            .limit(fetch)
        ),
        lambda b: (b.id, b.title, b.description, f"/boards/{b.id}", None, ""),
    )
    add(
        "card",
        db.execute(
            select(BoardCard, Board.title)
            .join(Board, Board.id == BoardCard.board_id)
            .where(
                Board.workspace_id == ws_id,
                BoardCard.archived.is_(False),
                matches_all(words, BoardCard.title, BoardCard.description_text),
            )
            .limit(fetch)
        ),
        lambda r: (
            r[0].id,
            r[0].title,
            f"{r[1]} · {r[0].description_text}",
            f"/boards/{r[0].board_id}?card={r[0].id}",
            None,
            "",
        ),
    )
    add(
        "doc",
        db.scalars(
            select(DocSpace)
            .where(
                DocSpace.workspace_id == ws_id,
                matches_all(words, DocSpace.title, DocSpace.description),
            )
            .limit(fetch)
        ),
        lambda s: (s.id, s.title, s.description, f"/docs/{s.id}", s.updated_at, s.icon),
    )
    add(
        "doc_page",
        db.execute(
            select(DocPage, DocSpace.title)
            .join(DocSpace, DocSpace.id == DocPage.space_id)
            .where(
                DocSpace.workspace_id == ws_id, matches_all(words, DocPage.title, DocPage.content)
            )
            .order_by(DocPage.updated_at.desc())
            .limit(fetch)
        ),
        lambda r: (
            r[0].id,
            r[0].title,
            f"{r[1]} · {r[0].content}",
            f"/docs/{r[0].space_id}/{r[0].id}",
            r[0].updated_at,
            r[0].icon,
        ),
    )
    add(
        "post",
        db.scalars(
            select(BlogPost)
            .where(
                BlogPost.workspace_id == ws_id,
                matches_all(words, BlogPost.title, BlogPost.excerpt, BlogPost.content),
            )
            .order_by(BlogPost.updated_at.desc())
            .limit(fetch)
        ),
        lambda p: (p.id, p.title, p.excerpt or p.content, f"/blog/{p.id}", p.updated_at, ""),
    )
    add(
        "project",
        db.scalars(
            select(Project)
            .where(
                Project.workspace_id == ws_id,
                matches_all(
                    words, Project.name, Project.summary, Project.description_text, Project.client
                ),
            )
            .limit(fetch)
        ),
        lambda p: (
            p.id,
            p.name,
            p.summary or p.description_text,
            f"/projects/{p.id}",
            p.updated_at,
            p.icon,
        ),
    )
    add(
        "drive",
        db.scalars(
            select(DriveItem)
            .where(
                DriveItem.workspace_id == ws_id,
                DriveItem.trashed_at.is_(None),
                matches_all(words, DriveItem.name, DriveItem.description),
            )
            .order_by(DriveItem.is_folder.desc(), DriveItem.updated_at.desc())
            .limit(fetch)
        ),
        lambda d: (
            d.id,
            d.name,
            d.description,
            f"/drive/item/{d.id}",
            d.updated_at,
            "📁" if d.is_folder else "",
        ),
    )
    decks = []
    for deck in db.scalars(
        select(SlideDeck)
        .where(SlideDeck.workspace_id == ws_id)
        .order_by(SlideDeck.updated_at.desc())
        .limit(500)
    ):
        texts = [
            f"{s.get('title', '')} {s.get('subtitle', '')} {s.get('body', '')} "
            f"{s.get('body2', '')} {s.get('notes', '')}"
            for s in deck.slides or []
            if isinstance(s, dict)
        ]
        body = " ".join(texts)
        if text_match(deck.title, deck.description, body):
            decks.append((deck, body))
    add(
        "deck",
        decks,
        lambda r: (r[0].id, r[0].title, r[1], f"/slides/{r[0].id}", r[0].updated_at, ""),
    )
    add(
        "lang_deck",
        db.scalars(
            select(LangDeck)
            .where(
                LangDeck.workspace_id == ws_id,
                matches_all(words, LangDeck.name, LangDeck.description),
            )
            .limit(fetch)
        ),
        lambda d: (d.id, d.name, d.description, f"/learn/decks/{d.id}", d.updated_at, d.icon),
    )
    add(
        "lang_card",
        db.execute(
            select(LangCard, LangDeck.name)
            .join(LangDeck, LangDeck.id == LangCard.deck_id)
            .where(
                LangDeck.workspace_id == ws_id,
                matches_all(
                    words,
                    LangCard.front,
                    LangCard.back,
                    LangCard.example,
                    LangCard.example_translation,
                    LangCard.notes,
                ),
            )
            .limit(fetch)
        ),
        lambda r: (
            r[0].id,
            f"{r[0].front} — {r[0].back}",
            f"{r[1]} · {r[0].example}",
            f"/learn/decks/{r[0].deck_id}?card={r[0].id}",
            r[0].updated_at,
            "",
        ),
    )
    songs = []
    for song in db.scalars(
        select(LangSong)
        .where(LangSong.workspace_id == ws_id)
        .order_by(LangSong.updated_at.desc())
        .limit(500)
    ):
        lyrics = " ".join(
            f"{line.get('text', '')} {line.get('translation', '')}"
            for line in song.lines or []
            if isinstance(line, dict)
        )
        if text_match(song.title, song.artist, lyrics):
            songs.append((song, lyrics))
    add(
        "song",
        songs,
        lambda r: (
            r[0].id,
            f"{r[0].title}{' — ' + r[0].artist if r[0].artist else ''}",
            r[1],
            f"/learn/songs/{r[0].id}",
            r[0].updated_at,
            "🎵",
        ),
    )
    add(
        "category",
        db.scalars(
            select(Category)
            .where(Category.workspace_id == ws_id, matches_all(words, Category.name))
            .limit(fetch)
        ),
        lambda c: (c.id, c.name, "", f"/notes?category={c.id}", None, c.icon),
    )
    if user_id is not None:
        conversation_ids = set(
            db.scalars(
                select(ChatMessage.conversation_id)
                .join(ChatConversation, ChatConversation.id == ChatMessage.conversation_id)
                .where(
                    ChatConversation.workspace_id == ws_id,
                    ChatConversation.user_id == user_id,
                    matches_all(words, ChatMessage.content),
                )
                .limit(fetch)
            )
        )
        chats = db.scalars(
            select(ChatConversation)
            .where(
                ChatConversation.workspace_id == ws_id,
                ChatConversation.user_id == user_id,
                or_(
                    matches_all(words, ChatConversation.title),
                    ChatConversation.id.in_(conversation_ids or {-1}),
                ),
            )
            .order_by(ChatConversation.updated_at.desc())
            .limit(fetch)
        ).all()

        def chat_text(conversation: ChatConversation) -> str:
            for content in db.scalars(
                select(ChatMessage.content)
                .where(ChatMessage.conversation_id == conversation.id)
                .order_by(ChatMessage.id)
            ):
                if text_match(content):
                    return content
            return ""

        add(
            "chat",
            chats,
            lambda c: (c.id, c.title, chat_text(c), f"/chat/{c.id}", c.updated_at, ""),
        )
        add(
            "alarm",
            db.scalars(
                select(Alarm)
                .where(Alarm.user_id == user_id, matches_all(words, Alarm.title, Alarm.note))
                .limit(fetch)
            ),
            lambda a: (a.id, a.title, f"{a.time} · {a.note}", f"/alarms?alarm={a.id}", None, "⏰"),
        )

    ranked: list[tuple[int, list[_Hit]]] = []
    for hits in groups.values():
        if not hits:
            continue
        hits.sort(key=lambda h: (h.score, h.when), reverse=True)
        ranked.append((hits[0].score, hits[:per_kind]))
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    return [hit.result for _, hits in ranked for hit in hits]
