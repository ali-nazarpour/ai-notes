"""
Drive: folders and files of a workspace, like a small Google Drive.

- Any file type can be uploaded. Limits (largest file, space per workspace, blocked
  extensions) are set by an administrator (``app_settings["drive"]``).
- Access: members of the workspace have their workspace role. A folder or file can also be
  shared with one person (``shares``, kind "drive"); sharing a folder shares everything
  inside it. A public link (random token) lets anyone with the link view and download.
- Trash: trashing sets ``trashed_at`` on the item; its children are hidden with it.
  Deleting forever removes the rows and the stored bytes.
"""

import secrets
import tempfile
import uuid
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any, BinaryIO

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, InvalidInputError, NotFoundError, PayloadTooLargeError
from app.models import DriveItem, Share, StoredFile, User, Workspace
from app.schemas.v5 import (
    DriveCrumb,
    DriveItemRead,
    DriveListing,
    DriveSettings,
    DriveUsage,
    PublicDrive,
)
from app.services import files as files_service
from app.services import mailer
from app.services.access import Ctx, member_role, read_only
from app.services.workspaces import display
from app.storage import ObjectStorage

_MB = 1024 * 1024
SECTIONS = ("files", "music", "videos", "photos", "documents")
_SECTION_KINDS = {
    "music": {"audio"},
    "videos": {"video"},
    "photos": {"image"},
    "documents": {"file"},
}


def section_accepts(section: str, kind: str) -> bool:
    """My Drive takes anything; the other sections only their own kind of file."""
    allowed = _SECTION_KINDS.get(section)
    return allowed is None or kind in allowed


ZIP_LIMIT = 2 * 1024 * _MB


def settings(db: Session) -> DriveSettings:
    return DriveSettings(**mailer.get_setting(db, "drive"))


def save_settings(db: Session, value: DriveSettings) -> DriveSettings:
    mailer.put_setting(db, "drive", value.model_dump())
    return value


def _missing() -> NotFoundError:
    return NotFoundError("This file or folder was not found.", code="drive_item_not_found")


# ---------------------------------------------------------------- access


def _ancestors(db: Session, item: DriveItem) -> list[DriveItem]:
    """The item's folders from the root down (not including the item)."""
    chain: list[DriveItem] = []
    seen = {item.id}
    parent_id = item.parent_id
    while parent_id is not None and parent_id not in seen:
        parent = db.get(DriveItem, parent_id)
        if parent is None:
            break
        chain.append(parent)
        seen.add(parent.id)
        parent_id = parent.parent_id
    return list(reversed(chain))


def _shared_role(db: Session, user_id: int, ids: list[int]) -> str | None:
    roles = set(
        db.scalars(
            select(Share.role).where(
                Share.kind == "drive", Share.item_id.in_(ids), Share.user_id == user_id
            )
        )
    )
    if "editor" in roles:
        return "editor"
    return "viewer" if roles else None


def role_for(db: Session, ctx: Ctx, item: DriveItem) -> str | None:
    if item.workspace_id == ctx.ws_id:
        return ctx.role
    role = member_role(db, ctx.user_id, item.workspace_id)
    if role is not None:
        return role
    ids = [item.id, *(a.id for a in _ancestors(db, item))]
    return _shared_role(db, ctx.user_id, ids)


def get_item(db: Session, ctx: Ctx, item_id: int, *, write: bool = False) -> DriveItem:
    item = db.get(DriveItem, item_id)
    if item is None:
        raise _missing()
    role = role_for(db, ctx, item)
    if role is None:
        raise _missing()
    if write and role == "viewer":
        raise read_only()
    return item


def _folder(db: Session, ctx: Ctx, folder_id: int | None, *, write: bool) -> DriveItem | None:
    if folder_id is None:
        if write:
            ctx.require_edit()
        return None
    folder = get_item(db, ctx, folder_id, write=write)
    if not folder.is_folder:
        raise InvalidInputError("This is not a folder.", code="drive_not_folder")
    if folder.trashed_at is not None:
        raise _missing()
    return folder


# ---------------------------------------------------------------- reading


def _children_counts(db: Session, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    rows = db.execute(
        select(DriveItem.parent_id, func.count())
        .where(DriveItem.parent_id.in_(ids), DriveItem.trashed_at.is_(None))
        .group_by(DriveItem.parent_id)
    ).all()
    return {int(parent): int(count) for parent, count in rows if parent is not None}


def _share_counts(db: Session, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    rows = db.execute(
        select(Share.item_id, func.count())
        .where(Share.kind == "drive", Share.item_id.in_(ids))
        .group_by(Share.item_id)
    ).all()
    return {int(item): int(count) for item, count in rows}


def read_items(db: Session, items: list[DriveItem]) -> list[DriveItemRead]:
    ids = [i.id for i in items]
    counts = _children_counts(db, [i.id for i in items if i.is_folder])
    shares = _share_counts(db, ids)
    owners = {
        u.id: display(u)
        for u in db.scalars(
            select(User).where(User.id.in_({i.owner_id for i in items if i.owner_id}))
        )
    }
    result = []
    for item in items:
        read = DriveItemRead.model_validate(item)
        read.link_enabled = item.link_token is not None
        read.url = f"/api/files/{item.file_id}" if item.file_id else None
        read.owner_name = owners.get(item.owner_id or 0, "")
        read.item_count = counts.get(item.id, 0)
        read.shared_count = shares.get(item.id, 0)
        result.append(read)
    return result


def _sorted(query: Any) -> Any:
    return query.order_by(DriveItem.is_folder.desc(), func.lower(DriveItem.name))


def _hidden_by_trash(db: Session, item: DriveItem) -> bool:
    return item.trashed_at is not None or any(
        a.trashed_at is not None for a in _ancestors(db, item)
    )


def listing(
    db: Session,
    ctx: Ctx,
    view: str,
    folder_id: int | None,
    q: str | None,
    section: str = "files",
) -> DriveListing:
    base = select(DriveItem).where(DriveItem.workspace_id == ctx.ws_id)
    folder: DriveItem | None = None
    path: list[DriveCrumb] = []
    role = ctx.role
    if view == "folder":
        folder = _folder(db, ctx, folder_id, write=False)
        if folder is not None:
            role = role_for(db, ctx, folder) or "viewer"
            ancestors = _ancestors(db, folder)
            if (
                folder.workspace_id != ctx.ws_id
                and member_role(db, ctx.user_id, folder.workspace_id) is None
            ):
                # Shared from another workspace: show the path from the shared folder down.
                shared_ids = set(
                    db.scalars(
                        select(Share.item_id).where(
                            Share.kind == "drive", Share.user_id == ctx.user_id
                        )
                    )
                )
                start = next(
                    (i for i, a in enumerate(ancestors) if a.id in shared_ids), len(ancestors)
                )
                ancestors = ancestors[start:]
            path = [DriveCrumb(id=a.id, name=a.name) for a in [*ancestors, folder]]
            query = select(DriveItem).where(DriveItem.parent_id == folder.id)
        else:
            query = base.where(DriveItem.parent_id.is_(None), DriveItem.section == section)
        rows = list(db.scalars(_sorted(query.where(DriveItem.trashed_at.is_(None)))))
    elif view == "trash":
        rows = list(
            db.scalars(
                base.where(DriveItem.trashed_at.is_not(None)).order_by(DriveItem.trashed_at.desc())
            )
        )
        trashed = {r.id for r in rows}
        rows = [r for r in rows if r.parent_id not in trashed]
    elif view == "shared":
        ids = list(
            db.scalars(
                select(Share.item_id)
                .where(Share.kind == "drive", Share.user_id == ctx.user_id)
                .order_by(Share.id.desc())
            )
        )
        rows = [
            r
            for r in db.scalars(select(DriveItem).where(DriveItem.id.in_(ids)))
            if r.trashed_at is None
        ]
        role = "viewer"
    else:
        query = base.where(DriveItem.trashed_at.is_(None))
        if view == "starred":
            query = _sorted(query.where(DriveItem.starred.is_(True)))
        elif view == "recent":
            query = query.where(DriveItem.is_folder.is_(False)).order_by(
                DriveItem.updated_at.desc()
            )
        else:  # search
            text = (q or "").strip()
            if not text:
                return DriveListing(folder=None, path=[], items=[], role=role)
            from app.services.notes import escape_like

            query = _sorted(
                query.where(DriveItem.name.ilike(f"%{escape_like(text)}%", escape="\\"))
            )
        rows = [r for r in db.scalars(query.limit(300)) if not _hidden_by_trash(db, r)]
        if view == "recent":
            rows = rows[:60]
    return DriveListing(
        folder=read_items(db, [folder])[0] if folder else None,
        path=path,
        items=read_items(db, rows),
        role=role,
    )


def folders_tree(db: Session, ctx: Ctx, section: str = "files") -> list[dict[str, Any]]:
    """All folders of the workspace (id, name, parent) for the "move to" dialog."""
    rows = db.execute(
        select(DriveItem.id, DriveItem.name, DriveItem.parent_id, DriveItem.color)
        .where(
            DriveItem.workspace_id == ctx.ws_id,
            DriveItem.is_folder.is_(True),
            DriveItem.trashed_at.is_(None),
            DriveItem.section == section,
        )
        .order_by(func.lower(DriveItem.name))
    ).all()
    return [{"id": i, "name": n, "parent_id": p, "color": c} for i, n, p, c in rows]


def usage(db: Session, ws_id: int) -> DriveUsage:
    config = settings(db)
    rows = db.execute(
        select(
            DriveItem.kind,
            DriveItem.is_folder,
            func.count(),
            func.coalesce(func.sum(DriveItem.size), 0),
        )
        .where(DriveItem.workspace_id == ws_id)
        .group_by(DriveItem.kind, DriveItem.is_folder)
    ).all()
    files = folders = used = 0
    by_kind: dict[str, int] = {}
    for kind, is_folder, count, size in rows:
        if is_folder:
            folders += int(count)
            continue
        files += int(count)
        used += int(size)
        by_kind[kind or "file"] = by_kind.get(kind or "file", 0) + int(size)
    return DriveUsage(
        used=used,
        quota=config.workspace_quota_mb * _MB,
        max_file=config.max_file_mb * _MB,
        files=files,
        folders=folders,
        by_kind=by_kind,
        blocked_extensions=config.blocked_extensions,
    )


# ---------------------------------------------------------------- changing


def _unique_name(
    db: Session,
    ws_id: int,
    parent_id: int | None,
    name: str,
    skip: int = 0,
    section: str = "files",
) -> str:
    """ "report.pdf" -> "report (2).pdf" when the folder already has that name."""
    existing = {
        n.lower()
        for n in db.scalars(
            select(DriveItem.name).where(
                DriveItem.workspace_id == ws_id,
                and_(DriveItem.parent_id.is_(None), DriveItem.section == section)
                if parent_id is None
                else DriveItem.parent_id == parent_id,
                DriveItem.trashed_at.is_(None),
                DriveItem.id != skip,
            )
        )
    }
    if name.lower() not in existing:
        return name
    stem, dot, ext = name.rpartition(".")
    if not dot or not stem:
        stem, ext = name, ""
    for n in range(2, 1000):
        candidate = f"{stem} ({n}){'.' + ext if ext else ''}"
        if candidate.lower() not in existing:
            return candidate
    return f"{stem} ({secrets.token_hex(3)}){'.' + ext if ext else ''}"


def create_folder(
    db: Session,
    ctx: Ctx,
    name: str,
    parent_id: int | None,
    color: str | None,
    section: str = "files",
    project_id: int | None = None,
) -> DriveItem:
    parent = _folder(db, ctx, parent_id, write=True)
    ws_id = parent.workspace_id if parent else ctx.ws_id
    section = parent.section if parent else section
    folder = DriveItem(
        workspace_id=ws_id,
        parent_id=parent.id if parent else None,
        is_folder=True,
        section=section,
        project_id=project_id,
        name=_unique_name(db, ws_id, parent.id if parent else None, name, section=section),
        color=color,
        owner_id=ctx.user_id,
        updated_by=ctx.user_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def _folder_by_path(
    db: Session, ctx: Ctx, parent: DriveItem | None, parts: list[str], section: str
) -> DriveItem | None:
    """Finds or creates the folders of an uploaded folder's relative path."""
    ws_id = parent.workspace_id if parent else ctx.ws_id
    current = parent
    for raw in parts:
        name = " ".join(raw.split()).strip()[:255]
        if not name or name in (".", ".."):
            continue
        parent_id = current.id if current else None
        found = db.scalar(
            select(DriveItem).where(
                DriveItem.workspace_id == ws_id,
                and_(DriveItem.parent_id.is_(None), DriveItem.section == section)
                if parent_id is None
                else DriveItem.parent_id == parent_id,
                DriveItem.is_folder.is_(True),
                DriveItem.trashed_at.is_(None),
                func.lower(DriveItem.name) == name.lower(),
            )
        )
        if found is None:
            found = DriveItem(
                workspace_id=ws_id,
                parent_id=parent_id,
                is_folder=True,
                section=section,
                name=name,
                owner_id=ctx.user_id,
                updated_by=ctx.user_id,
            )
            db.add(found)
            db.flush()
        current = found
    return current


def upload(
    db: Session,
    storage: ObjectStorage,
    ctx: Ctx,
    parent_id: int | None,
    data: BinaryIO,
    filename: str,
    relative_path: str = "",
    section: str = "files",
) -> DriveItem:
    parent = _folder(db, ctx, parent_id, write=True)
    ws_id = parent.workspace_id if parent else ctx.ws_id
    section = parent.section if parent else section
    config = settings(db)
    name = " ".join((filename or "file").replace("\\", "/").split("/")[-1].split()).strip()[:255]
    name = name or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext and ext in config.blocked_extensions:
        raise InvalidInputError(
            "This file type is not allowed in the drive.", code="drive_type_blocked", ext=ext
        )
    data.seek(0, 2)
    size = data.tell()
    data.seek(0)
    if size > config.max_file_mb * _MB:
        raise PayloadTooLargeError(
            f"The file is too large (limit {config.max_file_mb} MB).",
            code="file_too_large",
            limit_mb=config.max_file_mb,
        )
    if config.workspace_quota_mb:
        used = db.scalar(
            select(func.coalesce(func.sum(DriveItem.size), 0)).where(
                DriveItem.workspace_id == ws_id
            )
        )
        if int(used or 0) + size > config.workspace_quota_mb * _MB:
            raise PayloadTooLargeError(
                "The drive of this workspace is full.",
                code="drive_full",
                limit_mb=config.workspace_quota_mb,
            )
    head = data.read(4096)
    data.seek(0)
    detected = files_service.detect_file_type(head, name)
    kind = detected.kind if detected else "file"
    if not section_accepts(section, kind):
        raise InvalidInputError(
            "This kind of file does not belong in this section.",
            code="drive_wrong_section",
            section=section,
        )
    folders = [p for p in relative_path.replace("\\", "/").split("/")[:-1] if p][:20]
    if folders:
        parent = _folder_by_path(db, ctx, parent, folders, section)
    stored = files_service.store_any(db, storage, ctx.user_id, data, name, size)
    item = DriveItem(
        workspace_id=ws_id,
        parent_id=parent.id if parent else None,
        is_folder=False,
        section=section,
        name=_unique_name(db, ws_id, parent.id if parent else None, name, section=section),
        file_id=stored.id,
        kind=stored.kind,
        content_type=stored.content_type,
        size=size,
        owner_id=ctx.user_id,
        updated_by=ctx.user_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _is_inside(db: Session, folder: DriveItem, item: DriveItem) -> bool:
    return folder.id == item.id or any(a.id == item.id for a in _ancestors(db, folder))


def update(db: Session, ctx: Ctx, item: DriveItem, changes: dict[str, Any]) -> DriveItem:
    if "parent_id" in changes:
        target = _folder(db, ctx, changes["parent_id"], write=True)
        if target is not None:
            if target.workspace_id != item.workspace_id:
                raise InvalidInputError(
                    "Files can only be moved inside one workspace.", code="drive_other_workspace"
                )
            if target.section != item.section:
                raise InvalidInputError(
                    "Items can only be moved inside their own section.",
                    code="drive_wrong_section",
                    section=item.section,
                )
            if _is_inside(db, target, item):
                raise ConflictError(
                    "A folder cannot be moved into itself.", code="drive_move_into_self"
                )
        item.parent_id = target.id if target else None
        item.name = _unique_name(
            db, item.workspace_id, item.parent_id, item.name, skip=item.id, section=item.section
        )
    if changes.get("name"):
        item.name = _unique_name(
            db,
            item.workspace_id,
            item.parent_id,
            changes["name"],
            skip=item.id,
            section=item.section,
        )
    for key in ("starred", "color", "description"):
        if key in changes and (changes[key] is not None or key == "color"):
            setattr(item, key, changes[key])
    item.updated_by = ctx.user_id
    db.commit()
    db.refresh(item)
    return item


def trash(db: Session, item: DriveItem) -> None:
    item.trashed_at = datetime.now(UTC)
    db.commit()


def restore(db: Session, item: DriveItem) -> DriveItem:
    item.trashed_at = None
    if item.parent_id is not None:
        parent = db.get(DriveItem, item.parent_id)
        if parent is None or _hidden_by_trash(db, parent):
            item.parent_id = None  # its folder is gone or in the trash: restore to the root
    item.name = _unique_name(
        db, item.workspace_id, item.parent_id, item.name, skip=item.id, section=item.section
    )
    db.commit()
    db.refresh(item)
    return item


def _subtree(db: Session, item: DriveItem) -> list[DriveItem]:
    result = [item]
    frontier = [item.id]
    while frontier:
        children = list(db.scalars(select(DriveItem).where(DriveItem.parent_id.in_(frontier))))
        result.extend(children)
        frontier = [c.id for c in children if c.is_folder]
    return result


def delete_forever(db: Session, storage: ObjectStorage, items: list[DriveItem]) -> None:
    file_ids: list[uuid.UUID] = []
    for item in items:
        file_ids.extend(i.file_id for i in _subtree(db, item) if i.file_id)
    stored = (
        list(db.scalars(select(StoredFile).where(StoredFile.id.in_(file_ids)))) if file_ids else []
    )
    keys = [s.object_key for s in stored]
    for item in items:
        db.delete(item)
    for row in stored:
        db.delete(row)
    db.commit()
    storage.delete_keys(keys)


def empty_trash(db: Session, storage: ObjectStorage, ctx: Ctx) -> None:
    ctx.require_edit()
    rows = list(
        db.scalars(
            select(DriveItem).where(
                DriveItem.workspace_id == ctx.ws_id, DriveItem.trashed_at.is_not(None)
            )
        )
    )
    ids = {r.id for r in rows}
    delete_forever(db, storage, [r for r in rows if r.parent_id not in ids])


def set_link(db: Session, item: DriveItem, enabled: bool) -> str | None:
    if enabled and item.link_token is None:
        item.link_token = secrets.token_urlsafe(24)
    elif not enabled:
        item.link_token = None
    db.commit()
    return item.link_token


# ---------------------------------------------------------------- folder as ZIP


def zip_folder(
    db: Session, storage: ObjectStorage, folder: DriveItem
) -> tuple[Iterator[bytes], int]:
    """Writes the folder's files into a temporary ZIP and streams it."""
    entries: list[tuple[str, DriveItem]] = []
    names: dict[int, str] = {folder.id: ""}
    frontier = [folder]
    total = 0
    while frontier:
        next_frontier = []
        for parent in frontier:
            for child in db.scalars(
                select(DriveItem).where(
                    DriveItem.parent_id == parent.id, DriveItem.trashed_at.is_(None)
                )
            ):
                path = f"{names[parent.id]}{child.name}"
                if child.is_folder:
                    names[child.id] = f"{path}/"
                    next_frontier.append(child)
                else:
                    entries.append((path, child))
                    total += child.size
        frontier = next_frontier
    if total > ZIP_LIMIT:
        raise PayloadTooLargeError(
            "This folder is too large to download as one ZIP file.",
            code="zip_too_large",
            limit_mb=ZIP_LIMIT // _MB,
        )
    # Closed by stream() once the response is sent.
    spool = tempfile.SpooledTemporaryFile(max_size=64 * _MB)  # noqa: SIM115
    with zipfile.ZipFile(spool, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, item in entries:
            stored = db.get(StoredFile, item.file_id) if item.file_id else None
            if stored is None:
                continue
            with archive.open(path, "w", force_zip64=True) as target:
                for chunk in storage.open(stored.object_key):
                    target.write(chunk)
    size = spool.tell()
    spool.seek(0)

    def stream() -> Iterator[bytes]:
        try:
            while chunk := spool.read(256 * 1024):
                yield chunk
        finally:
            spool.close()

    return stream(), size


# ---------------------------------------------------------------- public links


def _public_root(db: Session, token: str) -> DriveItem:
    item = db.scalar(select(DriveItem).where(DriveItem.link_token == token))
    if item is None or _hidden_by_trash(db, item):
        raise NotFoundError("This link is invalid or was turned off.", code="drive_link_invalid")
    return item


def public_view(db: Session, token: str, folder_id: int | None) -> PublicDrive:
    root = _public_root(db, token)
    folder = root
    if folder_id is not None and folder_id != root.id:
        candidate = db.get(DriveItem, folder_id)
        if (
            candidate is None
            or not candidate.is_folder
            or candidate.trashed_at is not None
            or not any(a.id == root.id for a in _ancestors(db, candidate))
        ):
            raise _missing()
        folder = candidate
    items: list[DriveItem] = []
    if folder.is_folder:
        items = list(
            db.scalars(
                _sorted(
                    select(DriveItem).where(
                        DriveItem.parent_id == folder.id, DriveItem.trashed_at.is_(None)
                    )
                )
            )
        )
    chain = _ancestors(db, folder) if folder.id != root.id else []
    start = next((i for i, a in enumerate(chain) if a.id == root.id), len(chain))
    path = [DriveCrumb(id=a.id, name=a.name) for a in chain[start:]]
    if folder.id != root.id:
        path.append(DriveCrumb(id=folder.id, name=folder.name))
    else:
        path = [DriveCrumb(id=root.id, name=root.name)]
    workspace = db.get(Workspace, root.workspace_id)
    reads = read_items(db, [root, folder, *items])
    for read in reads:
        read.owner_name = ""
        read.shared_count = 0
    return PublicDrive(
        root=reads[0],
        folder=reads[1],
        path=path,
        items=reads[2:],
        workspace_name=workspace.name if workspace else "",
    )


def public_zip(
    db: Session, storage: ObjectStorage, token: str, folder_id: int | None
) -> tuple[Iterator[bytes], int, str]:
    view = public_view(db, token, folder_id)
    folder = db.get(DriveItem, view.folder.id)
    assert folder is not None
    body, size = zip_folder(db, storage, folder)
    return body, size, folder.name
