"""
Notes. Lists show the current workspace; a single note opens for members of its
workspace and for people it was shared with (anyone else gets 404).

Lists never load ``content`` or ``body`` (they can be large); they use ``excerpt``.
Deleting moves a note to the trash first; ``DELETE`` removes it for good.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session, load_only

from app.ai.retrieval import NoteText
from app.ai.text import excerpt
from app.core.errors import ConflictError, NotFoundError
from app.models import Note, Share, User
from app.models.note import EXCERPT_LENGTH
from app.schemas.chat import ChatScope
from app.schemas.note import NoteCreate, NoteRead
from app.services import categories as categories_service
from app.services import revisions
from app.services.access import Ctx, at_least, check, member_role, read_only

_SUMMARY_COLUMNS = (
    Note.id,
    Note.title,
    Note.excerpt,
    Note.cover,
    Note.category_id,
    Note.is_favorite,
    Note.deleted_at,
    Note.created_at,
    Note.updated_at,
    Note.user_id,
    Note.workspace_id,
)


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_notes(
    db: Session,
    ws_id: int,
    search: str | None = None,
    favorite: bool | None = None,
    category_id: int | None = None,
    trashed: bool = False,
) -> list[Note]:
    """The workspace's notes, most recently edited first, without content or body."""
    query = (
        select(Note)
        .options(load_only(*_SUMMARY_COLUMNS))
        .where(Note.workspace_id == ws_id)
        .where(Note.deleted_at.is_not(None) if trashed else Note.deleted_at.is_(None))
        .order_by(Note.updated_at.desc(), Note.id.desc())
    )
    if favorite is not None:
        query = query.where(Note.is_favorite.is_(favorite))
    if category_id is not None:
        query = query.where(Note.category_id == category_id)
    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        query = query.where(
            or_(Note.title.ilike(pattern, escape="\\"), Note.content.ilike(pattern, escape="\\"))
        )
    return list(db.scalars(query))


def notes_for_scope(db: Session, ws_id: int, scope: ChatScope) -> list[NoteText]:
    """Title and content of the notes an AI conversation may read."""
    query = select(Note.id, Note.title, Note.content).where(
        Note.workspace_id == ws_id, Note.deleted_at.is_(None)
    )
    if scope.category_ids is not None:
        conditions = [Note.category_id.in_(scope.category_ids)]
        if scope.include_uncategorized:
            conditions.append(Note.category_id.is_(None))
        query = query.where(or_(*conditions))
    elif not scope.include_uncategorized:
        query = query.where(Note.category_id.is_not(None))
    rows = db.execute(query.order_by(Note.updated_at.desc(), Note.id.desc())).all()
    return [NoteText(id=row.id, title=row.title, content=row.content) for row in rows]


def _missing(note_id: int) -> NotFoundError:
    return NotFoundError("Note not found.", code="note_not_found", note_id=note_id)


def get_note(db: Session, ctx: Ctx, note_id: int, *, write: bool = False) -> Note:
    note = db.get(Note, note_id)
    if note is None:
        raise _missing(note_id)
    check(db, ctx, "note", note.workspace_id, note.id, write=write, missing=_missing(note_id))
    return note


def note_read(db: Session, ctx: Ctx, note: Note) -> NoteRead:
    read = NoteRead.model_validate(note)
    role = None
    if note.workspace_id is not None:
        role = (
            ctx.role
            if note.workspace_id == ctx.ws_id
            else member_role(db, ctx.user_id, note.workspace_id)
        )
    if role is None:
        role = db.scalar(
            select(Share.role).where(
                Share.kind == "note", Share.item_id == note.id, Share.user_id == ctx.user_id
            )
        )
        read.shared = True
    read.role = role or "viewer"  # type: ignore[assignment]
    if note.updated_by:
        editor = db.get(User, note.updated_by)
        if editor is not None:
            read.updated_by_name = editor.display_name or editor.email
    return read


def create_note(db: Session, ctx: Ctx, data: NoteCreate) -> Note:
    ctx.require_edit()
    categories_service.ensure_owned(db, ctx.ws_id, data.category_id)
    note = Note(
        user_id=ctx.user_id,
        workspace_id=ctx.ws_id,
        updated_by=ctx.user_id,
        title=data.title,
        content=data.content,
        body=data.body,
        excerpt=excerpt(data.content, EXCERPT_LENGTH),
        category_id=data.category_id,
        cover=data.cover,
        is_favorite=data.is_favorite,
    )
    ws_settings = ctx.workspace.settings or {}
    if ws_settings.get("default_font") or ws_settings.get("full_width"):
        note.settings = {
            "font": ws_settings.get("default_font", "default"),
            "full_width": bool(ws_settings.get("full_width", False)),
        }
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, ctx: Ctx, note: Note, changes: dict[str, Any]) -> Note:
    """
    Applies a PATCH. Changing only the favorite flag does not count as an edit, so it
    keeps ``updated_at``. A locked note rejects text changes until it is unlocked.
    """
    if changes.get("workspace_id") == note.workspace_id:
        del changes["workspace_id"]
    if not changes:
        return note
    if "workspace_id" in changes:
        target = changes["workspace_id"]
        role = member_role(db, ctx.user_id, target)
        if role is None or not at_least(role, "editor"):
            raise read_only()
        changes["category_id"] = None
    elif "category_id" in changes:
        categories_service.ensure_owned(db, note.workspace_id, changes["category_id"])

    if set(changes) == {"is_favorite"}:
        db.execute(
            update(Note)
            .where(Note.id == note.id)
            .values(is_favorite=changes["is_favorite"], updated_at=Note.updated_at)
        )
        db.commit()
        db.refresh(note)
        return note

    locked = bool((note.settings or {}).get("locked"))
    new_settings = changes.get("settings")
    still_locked = locked and (new_settings is None or new_settings.get("locked", True))
    if still_locked and {"title", "content", "body"} & set(changes):
        raise ConflictError("This page is locked. Unlock it to edit.", code="note_locked")

    if "body" in changes or "content" in changes:
        revisions.snapshot(
            db, "note", note.id, note.title, note.body, note.content, note.updated_by
        )
    for field, value in changes.items():
        setattr(note, field, value)
    if "content" in changes:
        note.excerpt = excerpt(changes["content"], EXCERPT_LENGTH)
    if {"title", "content", "body", "cover", "settings"} & set(changes):
        note.updated_by = ctx.user_id
    db.commit()
    db.refresh(note)
    return note


def restore_revision(db: Session, ctx: Ctx, note: Note, revision_id: int) -> Note:
    revision = revisions.get_revision(db, "note", note.id, revision_id)
    revisions.snapshot(
        db, "note", note.id, note.title, note.body, note.content, note.updated_by, force=True
    )
    note.title = revision.title
    note.body = revision.body
    note.content = revision.content
    note.excerpt = excerpt(revision.content, EXCERPT_LENGTH)
    note.updated_by = ctx.user_id
    db.commit()
    db.refresh(note)
    return note


def trash_note(db: Session, note: Note) -> None:
    db.execute(
        update(Note)
        .where(Note.id == note.id)
        .values(deleted_at=datetime.now(UTC), updated_at=Note.updated_at)
    )
    db.commit()


def restore_note(db: Session, note: Note) -> Note:
    db.execute(
        update(Note).where(Note.id == note.id).values(deleted_at=None, updated_at=Note.updated_at)
    )
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, note: Note) -> None:
    revisions.delete_for(db, "note", [note.id])
    db.execute(delete(Share).where(Share.kind == "note", Share.item_id == note.id))
    db.delete(note)
    db.commit()


def empty_trash(db: Session, ctx: Ctx) -> int:
    ctx.require_edit()
    rows = list_notes(db, ctx.ws_id, trashed=True)
    for note in rows:
        revisions.delete_for(db, "note", [note.id])
        db.delete(note)
    db.commit()
    return len(rows)
