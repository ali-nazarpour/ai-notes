"""
Backup export and import of a workspace, as one ZIP file.

Layout::

    manifest.json        {"format": "ai-notes-backup", "version": 2, "exported_at": ...}
    data.json            categories, notes, tasks, chats, boards, documentation, blog
                         posts, projects, the user's vault (still encrypted)
    files/<id>.<ext>     uploaded files used by that content (and the user's own uploads)

Import *adds* the backup to the current workspace (nothing is deleted). Ids are remapped,
file URLs inside notes/boards are rewritten to the newly stored files, and categories with
an existing name are reused. The vault is imported only when the account has no vault yet,
or when the backup's vault uses the same master-password key. All database work happens in
one transaction; if anything fails, the stored files are removed again.
"""

import json
import logging
import re
import tempfile
import uuid
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import IO, Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import InvalidInputError, PayloadTooLargeError
from app.models import (
    BlogPost,
    Board,
    BoardCard,
    BoardList,
    CardComment,
    Category,
    ChatConversation,
    ChatMessage,
    DocPage,
    DocSpace,
    Note,
    Project,
    StoredFile,
    Task,
    Vault,
    VaultItem,
)
from app.services.access import Ctx
from app.services.blog import slugify
from app.services.files import detect_file_type
from app.storage import ObjectStorage

logger = logging.getLogger(__name__)

FORMAT = "ai-notes-backup"
VERSION = 2
_FILE_URL = re.compile(r"/api/files/([0-9a-fA-F-]{36})")
_DATA_MAX_BYTES = 512 * 1024 * 1024
_CHUNK = 1024 * 1024


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value is not None else None


def _dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


# ---------------------------------------------------------------- export


def _collect(db: Session, ctx: Ctx) -> dict[str, Any]:
    user = ctx.user
    uid, wid = user.id, ctx.ws_id
    categories = db.scalars(select(Category).where(Category.workspace_id == wid)).all()
    notes = db.scalars(
        select(Note).where(Note.workspace_id == wid, Note.deleted_at.is_(None))
    ).all()
    tasks = db.scalars(select(Task).where(Task.workspace_id == wid)).all()
    chats = db.scalars(
        select(ChatConversation).where(
            ChatConversation.user_id == uid, ChatConversation.workspace_id == wid
        )
    ).all()
    boards = db.scalars(select(Board).where(Board.workspace_id == wid)).all()
    spaces = db.scalars(select(DocSpace).where(DocSpace.workspace_id == wid)).all()
    posts = db.scalars(select(BlogPost).where(BlogPost.workspace_id == wid)).all()
    projects = db.scalars(select(Project).where(Project.workspace_id == wid)).all()
    vault = db.get(Vault, uid)

    def doc_data(space: DocSpace) -> dict[str, Any]:
        pages = db.scalars(select(DocPage).where(DocPage.space_id == space.id)).all()
        return {
            "title": space.title,
            "description": space.description,
            "icon": space.icon,
            "color": space.color,
            "cover": space.cover,
            "category_id": space.category_id,
            "tags": space.tags or [],
            "version": space.version,
            "starred": space.starred,
            "pages": [
                {
                    "id": p.id,
                    "parent_id": p.parent_id,
                    "title": p.title,
                    "icon": p.icon,
                    "body": p.body,
                    "content": p.content,
                    "position": p.position,
                }
                for p in pages
            ],
        }

    def messages(chat_id: int) -> list[dict[str, Any]]:
        rows = db.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == chat_id)
            .order_by(ChatMessage.id)
        )
        return [
            {
                "role": m.role,
                "content": m.content,
                "sources": m.sources,
                "meta": m.meta,
                "created_at": _iso(m.created_at),
            }
            for m in rows
        ]

    def board_data(board: Board) -> dict[str, Any]:
        lists = db.scalars(select(BoardList).where(BoardList.board_id == board.id)).all()
        cards = db.scalars(select(BoardCard).where(BoardCard.board_id == board.id)).all()
        comments: dict[int, list[dict[str, Any]]] = {}
        if cards:
            for c in db.scalars(
                select(CardComment).where(CardComment.card_id.in_([card.id for card in cards]))
            ):
                comments.setdefault(c.card_id, []).append(
                    {"text": c.text, "created_at": _iso(c.created_at)}
                )
        return {
            "id": board.id,
            "title": board.title,
            "description": board.description,
            "background": board.background,
            "starred": board.starred,
            "labels": board.labels or [],
            "created_at": _iso(board.created_at),
            "lists": [
                {
                    "id": row.id,
                    "title": row.title,
                    "position": row.position,
                    "color": row.color,
                    "wip_limit": row.wip_limit,
                }
                for row in lists
            ],
            "cards": [
                {
                    "list_id": card.list_id,
                    "title": card.title,
                    "position": card.position,
                    "description": card.description,
                    "description_text": card.description_text,
                    "label_ids": card.label_ids or [],
                    "start_date": _iso(card.start_date),
                    "due_date": _iso(card.due_date),
                    "due_done": card.due_done,
                    "cover": card.cover,
                    "checklists": card.checklists or [],
                    "attachments": card.attachments or [],
                    "archived": card.archived,
                    "created_at": _iso(card.created_at),
                    "comments": comments.get(card.id, []),
                }
                for card in cards
            ],
        }

    data: dict[str, Any] = {
        "workspace": {"name": ctx.workspace.name, "icon": ctx.workspace.icon},
        "profile": {
            "display_name": user.display_name,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "birth_date": _iso(user.birth_date),
            "phone": user.phone,
            "address": user.address,
            "bio": user.bio,
            "avatar": user.avatar,
            "theme": user.theme,
            "accent_color": user.accent_color,
            "language": user.language,
        },
        "categories": [
            {"id": c.id, "name": c.name, "color": c.color, "icon": c.icon} for c in categories
        ],
        "notes": [
            {
                "title": n.title,
                "content": n.content,
                "body": n.body,
                "cover": n.cover,
                "category_id": n.category_id,
                "is_favorite": n.is_favorite,
                "created_at": _iso(n.created_at),
                "updated_at": _iso(n.updated_at),
            }
            for n in notes
        ],
        "tasks": [
            {
                "title": t.title,
                "is_done": t.is_done,
                "due_date": _iso(t.due_date),
                "category_id": t.category_id,
                "created_at": _iso(t.created_at),
                "completed_at": _iso(t.completed_at),
            }
            for t in tasks
        ],
        "chats": [
            {
                "title": c.title,
                "scope": c.scope,
                "created_at": _iso(c.created_at),
                "messages": messages(c.id),
            }
            for c in chats
        ],
        "boards": [board_data(b) for b in boards],
        "docs": [doc_data(s) for s in spaces],
        "posts": [
            {
                "title": p.title,
                "slug": p.slug,
                "excerpt": p.excerpt,
                "body": p.body,
                "content": p.content,
                "cover": p.cover,
                "tags": p.tags or [],
                "category_id": p.category_id,
                "status": p.status,
                "published_at": _iso(p.published_at),
                "seo_title": p.seo_title,
                "seo_description": p.seo_description,
                "featured": p.featured,
                "created_at": _iso(p.created_at),
            }
            for p in posts
        ],
        "projects": [
            {
                key: (
                    _iso(getattr(p, key))
                    if key in ("start_date", "end_date")
                    else float(p.budget)
                    if key == "budget" and p.budget is not None
                    else getattr(p, key)
                )
                for key in _PROJECT_FIELDS
            }
            for p in projects
        ],
        "vault": None
        if vault is None
        else {
            "kdf": vault.kdf,
            "iterations": vault.iterations,
            "salt": vault.salt,
            "verifier": vault.verifier,
            "items": [
                {"data": item.data}
                for item in db.scalars(
                    select(VaultItem).where(VaultItem.user_id == uid).order_by(VaultItem.id)
                )
            ],
        },
    }
    # Files: the user's own uploads plus every file the exported content refers to.
    referenced = set(_FILE_URL.findall(json.dumps(data, ensure_ascii=False, default=str)))
    ids = [uuid.UUID(i) for i in referenced if _is_uuid(i)]
    files = db.scalars(
        select(StoredFile).where((StoredFile.user_id == uid) | StoredFile.id.in_(ids))
    ).all()
    data["files"] = [
        {
            "id": str(f.id),
            "kind": f.kind,
            "content_type": f.content_type,
            "original_name": f.original_name,
            "path": f"files/{f.object_key.rsplit('/', 1)[-1]}",
        }
        for f in files
    ]
    return data


_PROJECT_FIELDS = (
    "name",
    "summary",
    "description",
    "description_text",
    "status",
    "priority",
    "kind",
    "color",
    "icon",
    "cover",
    "start_date",
    "end_date",
    "progress",
    "budget",
    "currency",
    "client",
    "category_id",
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
)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def export_zip(db: Session, storage: ObjectStorage, ctx: Ctx) -> tuple[IO[bytes], int]:
    """Writes the backup into a temporary file and returns it (rewound) with its size."""
    data = _collect(db, ctx)
    out = tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024)  # noqa: SIM115
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        manifest = {
            "format": FORMAT,
            "version": VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "counts": {k: len(v) for k, v in data.items() if isinstance(v, list)},
        }
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))
        archive.writestr("data.json", json.dumps(data, ensure_ascii=False))
        for entry in data["files"]:
            row = db.get(StoredFile, uuid.UUID(entry["id"]))
            if row is None:
                continue
            # Media is already compressed; storing it is faster and just as small.
            with archive.open(
                zipfile.ZipInfo(entry["path"], date_time=(2000, 1, 1, 0, 0, 0)), "w"
            ) as target:
                for chunk in storage.open(row.object_key):
                    target.write(chunk)
    size = out.tell()
    out.seek(0)
    return out, size


def iter_file(handle: IO[bytes]) -> Iterator[bytes]:
    try:
        while chunk := handle.read(_CHUNK):
            yield chunk
    finally:
        handle.close()


# ---------------------------------------------------------------- import


@dataclass
class ImportResult:
    categories: int = 0
    notes: int = 0
    tasks: int = 0
    chats: int = 0
    boards: int = 0
    cards: int = 0
    docs: int = 0
    doc_pages: int = 0
    posts: int = 0
    projects: int = 0
    files: int = 0
    vault_items: int = 0
    vault_skipped: bool = False
    warnings: list[str] = field(default_factory=list)


def _invalid(message: str) -> InvalidInputError:
    return InvalidInputError(message, code="invalid_backup")


def _rewrite(value: Any, urls: dict[str, str]) -> Any:
    """Replaces old file URLs with new ones anywhere inside a JSON value."""
    if isinstance(value, str):
        for old, new in urls.items():
            if old in value:
                value = value.replace(old, new)
        return value
    if isinstance(value, list):
        return [_rewrite(item, urls) for item in value]
    if isinstance(value, dict):
        return {key: _rewrite(item, urls) for key, item in value.items()}
    return value


def _check_archive(archive: zipfile.ZipFile, settings: Settings) -> None:
    infos = archive.infolist()
    if len(infos) > settings.import_max_entries:
        raise _invalid("The backup has too many files.")
    total = 0
    for info in infos:
        name = info.filename
        if name.startswith(("/", "\\")) or ".." in name.split("/") or ":" in name:
            raise _invalid("The backup contains an unsafe path.")
        total += info.file_size
    if total > settings.import_max_bytes:
        raise PayloadTooLargeError(
            "The backup is too large to import.",
            code="backup_too_large",
            limit_mb=settings.import_max_bytes // (1024 * 1024),
        )


def _read_json(archive: zipfile.ZipFile, name: str) -> Any:
    try:
        info = archive.getinfo(name)
    except KeyError as exc:
        raise _invalid(f"{name} is missing; this is not a backup of this app.") from exc
    if info.file_size > _DATA_MAX_BYTES:
        raise _invalid(f"{name} is too large.")
    try:
        return json.loads(archive.read(info))
    except (ValueError, zipfile.BadZipFile) as exc:
        raise _invalid(f"{name} is damaged.") from exc


def _as_list(data: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = data.get(key) or []
    if not isinstance(value, list):
        raise _invalid(f"'{key}' must be a list.")
    return [item for item in value if isinstance(item, dict)]


def _json_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text(value: Any, limit: int, default: str = "") -> str:
    return value[:limit] if isinstance(value, str) else default


def import_zip(
    db: Session, storage: ObjectStorage, settings: Settings, ctx: Ctx, upload: IO[bytes]
) -> ImportResult:
    try:
        archive = zipfile.ZipFile(upload)
    except zipfile.BadZipFile as exc:
        raise _invalid("The file is not a ZIP backup.") from exc

    with archive:
        _check_archive(archive, settings)
        manifest = _read_json(archive, "manifest.json")
        if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
            raise _invalid("This ZIP is not a backup of this app.")
        if not isinstance(manifest.get("version"), int) or manifest["version"] > VERSION:
            raise _invalid("The backup was made by a newer version of the app.")
        data = _read_json(archive, "data.json")
        if not isinstance(data, dict):
            raise _invalid("data.json is damaged.")

        stored_keys: list[str] = []
        try:
            result = _import(db, storage, settings, ctx, archive, data, stored_keys)
            db.commit()
            return result
        except Exception:
            db.rollback()
            storage.delete_keys(stored_keys)
            raise


def _import(
    db: Session,
    storage: ObjectStorage,
    settings: Settings,
    ctx: Ctx,
    archive: zipfile.ZipFile,
    data: dict[str, Any],
    stored_keys: list[str],
) -> ImportResult:
    result = ImportResult()
    uid, wid = ctx.user_id, ctx.ws_id

    # Files first, so URLs can be rewritten everywhere else.
    urls: dict[str, str] = {}
    for entry in _as_list(data, "files"):
        old_id, path = entry.get("id"), entry.get("path")
        if not isinstance(old_id, str) or not isinstance(path, str):
            continue
        try:
            info = archive.getinfo(path)
        except KeyError:
            result.warnings.append(f"missing file {path}")
            continue
        with archive.open(info) as source:
            media = detect_file_type(
                source.read(4096), _text(entry.get("original_name"), 255) or path
            )
        if media is None:
            result.warnings.append(f"unsupported file {path}")
            continue
        limit = {
            "image": settings.upload_max_image_bytes,
            "video": settings.upload_max_video_bytes,
            "audio": settings.upload_max_audio_bytes,
        }.get(media.kind, settings.upload_max_file_bytes)
        if info.file_size > limit:
            result.warnings.append(f"file too large {path}")
            continue
        new_id = uuid.uuid4()
        key = f"{uid}/{new_id}.{media.extension}"
        with archive.open(info) as source:
            storage.put(key, source, info.file_size, media.content_type)  # type: ignore[arg-type]
        stored_keys.append(key)
        db.add(
            StoredFile(
                id=new_id,
                user_id=uid,
                kind=media.kind,
                content_type=media.content_type,
                size=info.file_size,
                original_name=_text(entry.get("original_name"), 255),
                object_key=key,
            )
        )
        urls[f"/api/files/{old_id}"] = f"/api/files/{new_id}"
        result.files += 1

    # Categories: reuse by name (names are unique per workspace).
    existing = {
        c.name.casefold(): c
        for c in db.scalars(select(Category).where(Category.workspace_id == wid))
    }
    category_ids: dict[int, int] = {}
    for entry in _as_list(data, "categories"):
        name = _text(entry.get("name"), 50).strip()
        if not name or not isinstance(entry.get("id"), int):
            continue
        found = existing.get(name.casefold())
        if found is None:
            found = Category(
                user_id=uid,
                workspace_id=wid,
                name=name,
                color=_text(entry.get("color"), 20, "slate") or "slate",
                icon=_text(entry.get("icon"), 16),
            )
            db.add(found)
            db.flush()
            existing[name.casefold()] = found
            result.categories += 1
        category_ids[entry["id"]] = found.id

    def map_category(value: Any) -> int | None:
        return category_ids.get(value) if isinstance(value, int) else None

    for entry in _as_list(data, "notes"):
        content = _text(entry.get("content"), settings.note_max_chars)
        body = entry.get("body") if isinstance(entry.get("body"), dict) else None
        cover = _rewrite(entry.get("cover"), urls) if isinstance(entry.get("cover"), str) else None
        note = Note(
            user_id=uid,
            workspace_id=wid,
            title=_text(entry.get("title"), 200),
            content=content,
            body=_rewrite(body, urls) if body else None,
            excerpt=content[:280],
            cover=cover if cover and len(cover) <= 300 else None,
            category_id=map_category(entry.get("category_id")),
            is_favorite=bool(entry.get("is_favorite")),
        )
        if created := _dt(entry.get("created_at")):
            note.created_at = created
        if updated := _dt(entry.get("updated_at")):
            note.updated_at = updated
        db.add(note)
        result.notes += 1

    for entry in _as_list(data, "tasks"):
        title = _text(entry.get("title"), 200).strip()
        if not title:
            continue
        task = Task(
            user_id=uid,
            workspace_id=wid,
            title=title,
            is_done=bool(entry.get("is_done")),
            due_date=_date(entry.get("due_date")),
            category_id=map_category(entry.get("category_id")),
            completed_at=_dt(entry.get("completed_at")),
        )
        if created := _dt(entry.get("created_at")):
            task.created_at = created
        db.add(task)
        result.tasks += 1

    for entry in _as_list(data, "chats"):
        scope = entry.get("scope") if isinstance(entry.get("scope"), dict) else None
        if scope and isinstance(scope.get("category_ids"), list):
            scope = {
                **scope,
                "category_ids": [
                    category_ids[i] for i in scope["category_ids"] if i in category_ids
                ],
            }
        chat = ChatConversation(
            user_id=uid, workspace_id=wid, title=_text(entry.get("title"), 200), scope=scope
        )
        db.add(chat)
        db.flush()
        for message in entry.get("messages") or []:
            if not isinstance(message, dict) or message.get("role") not in ("user", "assistant"):
                continue
            message_row = ChatMessage(
                conversation_id=chat.id,
                role=message["role"],
                content=_text(message.get("content"), 200_000),
                # Note ids changed, so old source links would point to the wrong notes.
                sources=[],
                meta={"imported": True},
            )
            if created := _dt(message.get("created_at")):
                message_row.created_at = created
            db.add(message_row)
        result.chats += 1

    for entry in _as_list(data, "boards"):
        title = _text(entry.get("title"), 100).strip()
        if not title:
            continue
        background = _rewrite(_text(entry.get("background"), 300, "gradient:ocean"), urls)
        labels = entry.get("labels") if isinstance(entry.get("labels"), list) else []
        board = Board(
            user_id=uid,
            workspace_id=wid,
            title=title,
            description=_text(entry.get("description"), 5000),
            background=background or "gradient:ocean",
            starred=bool(entry.get("starred")),
            labels=labels,
        )
        db.add(board)
        db.flush()
        list_ids: dict[int, int] = {}
        for item in sorted(
            (i for i in entry.get("lists") or [] if isinstance(i, dict)),
            key=lambda i: i.get("position", 0) if isinstance(i.get("position"), int) else 0,
        ):
            if not isinstance(item.get("id"), int):
                continue
            row = BoardList(
                board_id=board.id,
                title=_text(item.get("title"), 100, "List") or "List",
                position=len(list_ids),
                color=_text(item.get("color"), 20) or None,
                wip_limit=item.get("wip_limit") if isinstance(item.get("wip_limit"), int) else None,
            )
            db.add(row)
            db.flush()
            list_ids[item["id"]] = row.id
        for card in entry.get("cards") or []:
            if not isinstance(card, dict) or card.get("list_id") not in list_ids:
                continue
            row_card = BoardCard(
                board_id=board.id,
                list_id=list_ids[card["list_id"]],
                title=_text(card.get("title"), 300, "Card") or "Card",
                position=card.get("position") if isinstance(card.get("position"), int) else 0,
                description=_rewrite(card.get("description"), urls)
                if isinstance(card.get("description"), dict)
                else None,
                description_text=_text(card.get("description_text"), 200_000),
                label_ids=card.get("label_ids") if isinstance(card.get("label_ids"), list) else [],
                start_date=_date(card.get("start_date")),
                due_date=_date(card.get("due_date")),
                due_done=bool(card.get("due_done")),
                cover=_rewrite(_text(card.get("cover"), 300), urls) or None,
                checklists=_json_list(card.get("checklists")),
                attachments=_rewrite(card.get("attachments"), urls)
                if isinstance(card.get("attachments"), list)
                else [],
                archived=bool(card.get("archived")),
            )
            db.add(row_card)
            db.flush()
            for comment in card.get("comments") or []:
                if isinstance(comment, dict) and isinstance(comment.get("text"), str):
                    db.add(CardComment(card_id=row_card.id, text=comment["text"][:5000]))
            result.cards += 1
        result.boards += 1

    _import_content(db, uid, wid, data, urls, map_category, result)

    vault = data.get("vault")
    if isinstance(vault, dict) and isinstance(vault.get("items"), list):
        result.vault_items, result.vault_skipped = _import_vault(db, uid, vault)

    return result


def _import_content(
    db: Session,
    uid: int,
    wid: int,
    data: dict[str, Any],
    urls: dict[str, str],
    map_category: Any,
    result: ImportResult,
) -> None:
    """Documentation, blog posts and projects (backups from version 2 on)."""
    for entry in _as_list(data, "docs"):
        title = _text(entry.get("title"), 120).strip()
        if not title:
            continue
        space = DocSpace(
            workspace_id=wid,
            user_id=uid,
            title=title,
            description=_text(entry.get("description"), 500),
            icon=_text(entry.get("icon"), 16),
            color=_text(entry.get("color"), 20, "blue") or "blue",
            cover=_rewrite(_text(entry.get("cover"), 300), urls) or None,
            category_id=map_category(entry.get("category_id")),
            tags=_json_list(entry.get("tags")),
            version=_text(entry.get("version"), 30),
            starred=bool(entry.get("starred")),
        )
        db.add(space)
        db.flush()
        pages = [p for p in entry.get("pages") or [] if isinstance(p, dict)]
        page_ids: dict[int, int] = {}
        # Parents before children: repeat until no page can be placed any more.
        pending = pages
        while pending:
            placed = []
            for page in pending:
                parent = page.get("parent_id")
                if parent is not None and parent not in page_ids:
                    continue
                body = page.get("body") if isinstance(page.get("body"), dict) else None
                row = DocPage(
                    space_id=space.id,
                    parent_id=page_ids.get(parent) if parent is not None else None,
                    title=_text(page.get("title"), 200),
                    icon=_text(page.get("icon"), 16),
                    body=_rewrite(body, urls) if body else None,
                    content=_text(page.get("content"), 2_000_000),
                    position=page.get("position") if isinstance(page.get("position"), int) else 0,
                    updated_by=uid,
                )
                db.add(row)
                db.flush()
                if isinstance(page.get("id"), int):
                    page_ids[page["id"]] = row.id
                placed.append(page)
                result.doc_pages += 1
            if not placed:
                break
            pending = [p for p in pending if p not in placed]
        result.docs += 1

    for entry in _as_list(data, "posts"):
        title = _text(entry.get("title"), 200)
        base = slugify(_text(entry.get("slug"), 100) or title)
        slug, n = base, 2
        while db.scalar(
            select(BlogPost.id).where(BlogPost.workspace_id == wid, BlogPost.slug == slug)
        ):
            slug, n = f"{base}-{n}", n + 1
        body = entry.get("body") if isinstance(entry.get("body"), dict) else None
        post = BlogPost(
            workspace_id=wid,
            user_id=uid,
            title=title,
            slug=slug,
            excerpt=_text(entry.get("excerpt"), 500),
            body=_rewrite(body, urls) if body else None,
            content=_text(entry.get("content"), 2_000_000),
            cover=_rewrite(_text(entry.get("cover"), 300), urls) or None,
            tags=_json_list(entry.get("tags")),
            category_id=map_category(entry.get("category_id")),
            status="published" if entry.get("status") == "published" else "draft",
            published_at=_dt(entry.get("published_at")),
            seo_title=_text(entry.get("seo_title"), 120),
            seo_description=_text(entry.get("seo_description"), 300),
            featured=bool(entry.get("featured")),
        )
        db.add(post)
        result.posts += 1

    for entry in _as_list(data, "projects"):
        name = _text(entry.get("name"), 120).strip()
        if not name:
            continue
        budget = entry.get("budget")
        description = entry.get("description")
        project = Project(
            workspace_id=wid,
            user_id=uid,
            name=name,
            summary=_text(entry.get("summary"), 300),
            description=_rewrite(description, urls) if isinstance(description, dict) else None,
            description_text=_text(entry.get("description_text"), 200_000),
            status=_text(entry.get("status"), 12, "planning") or "planning",
            priority=_text(entry.get("priority"), 8, "medium") or "medium",
            kind=_text(entry.get("kind"), 16, "general") or "general",
            color=_text(entry.get("color"), 20, "indigo") or "indigo",
            icon=_text(entry.get("icon"), 16),
            cover=_rewrite(_text(entry.get("cover"), 300), urls) or None,
            start_date=_date(entry.get("start_date")),
            end_date=_date(entry.get("end_date")),
            progress=entry.get("progress") if isinstance(entry.get("progress"), int) else None,
            budget=budget if isinstance(budget, int | float) else None,
            currency=_text(entry.get("currency"), 8, "USD") or "USD",
            client=_text(entry.get("client"), 120),
            category_id=map_category(entry.get("category_id")),
            tags=_json_list(entry.get("tags")),
            **{
                key: _rewrite(_json_list(entry.get(key)), urls)
                for key in (
                    "members",
                    "milestones",
                    "expenses",
                    "repositories",
                    "links",
                    "files",
                    "notes",
                )
            },
            starred=bool(entry.get("starred")),
            archived=bool(entry.get("archived")),
        )
        db.add(project)
        result.projects += 1


def _import_vault(db: Session, user_id: int, vault: dict[str, Any]) -> tuple[int, bool]:
    fields = ("kdf", "iterations", "salt", "verifier")
    if not all(vault.get(key) for key in fields):
        return 0, True
    current = db.get(Vault, user_id)
    if current is None:
        db.add(
            Vault(
                user_id=user_id,
                kdf=_text(vault["kdf"], 20),
                iterations=int(vault["iterations"]),
                salt=_text(vault["salt"], 64),
                verifier=_text(vault["verifier"], 65_536),
            )
        )
    elif current.salt != vault["salt"] or current.iterations != vault["iterations"]:
        # Encrypted with a different master password: the items could never be opened.
        return 0, True
    count = 0
    for item in vault["items"]:
        if isinstance(item, dict) and isinstance(item.get("data"), str) and item["data"]:
            db.add(VaultItem(user_id=user_id, data=item["data"][:65_536]))
            count += 1
    return count, False


def counts(db: Session, ctx: Ctx) -> dict[str, int]:
    """Totals shown next to the export button (current workspace + own vault)."""

    def total(model: Any) -> int:
        return db.scalar(select(func.count()).where(model.workspace_id == ctx.ws_id)) or 0

    def own(model: Any) -> int:
        return db.scalar(select(func.count()).where(model.user_id == ctx.user_id)) or 0

    return {
        "notes": total(Note),
        "tasks": total(Task),
        "categories": total(Category),
        "boards": total(Board),
        "docs": total(DocSpace),
        "posts": total(BlogPost),
        "projects": total(Project),
        "files": own(StoredFile),
        "chats": own(ChatConversation),
        "vault_items": own(VaultItem),
    }
