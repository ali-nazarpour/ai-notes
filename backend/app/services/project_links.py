"""
Linking workspace items to a project, and the calendar events of projects and boards.

Notes, tasks, boards, documentation spaces, presentations and drive items can each belong
to (at most) one project through their ``project_id``. The link is optional: every item
works the same without a project, and deleting a project only removes the links.
"""

from datetime import date as day_type
from typing import Any

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import InvalidInputError, NotFoundError
from app.models import (
    Alarm,
    Board,
    BoardCard,
    BoardList,
    DocSpace,
    DriveItem,
    Note,
    Project,
    SlideDeck,
    Task,
)
from app.services import drive as drive_service
from app.services.access import Ctx
from app.services.notes import escape_like

MODELS: dict[str, Any] = {
    "note": Note,
    "task": Task,
    "board": Board,
    "doc": DocSpace,
    "deck": SlideDeck,
    "drive": DriveItem,
}


class LinkedItem(BaseModel):
    kind: str
    id: int
    title: str
    subtitle: str = ""
    url: str
    icon: str = ""
    done: bool = False
    date: day_type | None = None
    project_id: int | None = None


class CalendarEvent(BaseModel):
    id: str
    kind: str  # project_start | project_end | milestone | card | alarm
    date: day_type
    title: str
    subtitle: str = ""
    url: str
    color: str = "indigo"
    done: bool = False


def _item(kind: str, row: Any) -> LinkedItem:
    if kind == "note":
        return LinkedItem(
            kind=kind,
            id=row.id,
            title=row.title,
            subtitle=row.excerpt or "",
            url=f"/notes/{row.id}",
            project_id=row.project_id,
        )
    if kind == "task":
        return LinkedItem(
            kind=kind,
            id=row.id,
            title=row.title,
            url="/tasks",
            done=row.is_done,
            date=row.due_date,
            project_id=row.project_id,
        )
    if kind == "board":
        return LinkedItem(
            kind=kind,
            id=row.id,
            title=row.title,
            subtitle=row.description,
            url=f"/boards/{row.id}",
            project_id=row.project_id,
        )
    if kind == "doc":
        return LinkedItem(
            kind=kind,
            id=row.id,
            title=row.title,
            subtitle=row.description,
            url=f"/docs/{row.id}",
            icon=row.icon,
            project_id=row.project_id,
        )
    if kind == "deck":
        return LinkedItem(
            kind=kind,
            id=row.id,
            title=row.title,
            subtitle=str(len(row.slides or [])),
            url=f"/slides/{row.id}",
            project_id=row.project_id,
        )
    url = (
        f"/drive/folders/{row.id}"
        if row.is_folder and row.section == "files"
        else f"/drive/item/{row.id}"
    )
    return LinkedItem(
        kind=kind,
        id=row.id,
        title=row.name,
        subtitle=row.section,
        url=url,
        icon="📁" if row.is_folder else "",
        project_id=row.project_id,
    )


def _visible(kind: str, query: Any) -> Any:
    if kind == "note":
        query = query.where(Note.deleted_at.is_(None))
    if kind == "drive":
        query = query.where(DriveItem.trashed_at.is_(None))
    return query


def links(db: Session, project: Project) -> dict[str, list[LinkedItem]]:
    result: dict[str, list[LinkedItem]] = {}
    for kind, model in MODELS.items():
        query = _visible(kind, select(model).where(model.project_id == project.id))
        order = model.id.desc()
        if kind == "task":
            order = Task.is_done
        rows = db.scalars(query.order_by(order).limit(200)).all()
        result[kind] = [_item(kind, row) for row in rows]
    return result


def _get_item(db: Session, ctx: Ctx, project: Project, kind: str, item_id: int) -> Any:
    model = MODELS.get(kind)
    if model is None:
        raise InvalidInputError("Unknown item type.", code="invalid_link_kind")
    row = db.get(model, item_id)
    if row is None or row.workspace_id != project.workspace_id:
        raise NotFoundError("Item not found.", code="item_not_found")
    return row


def link(db: Session, ctx: Ctx, project: Project, kind: str, item_id: int) -> LinkedItem:
    ctx.require_edit()
    row = _get_item(db, ctx, project, kind, item_id)
    row.project_id = project.id
    db.commit()
    db.refresh(row)
    return _item(kind, row)


def unlink(db: Session, ctx: Ctx, project: Project, kind: str, item_id: int) -> None:
    ctx.require_edit()
    row = _get_item(db, ctx, project, kind, item_id)
    if row.project_id == project.id:
        row.project_id = None
        db.commit()


def options(db: Session, project: Project, kind: str, q: str) -> list[LinkedItem]:
    """Items of the workspace that can be linked (not linked to this project yet)."""
    model = MODELS.get(kind)
    if model is None:
        raise InvalidInputError("Unknown item type.", code="invalid_link_kind")
    title = DriveItem.name if kind == "drive" else model.title
    query = _visible(
        kind,
        select(model).where(
            model.workspace_id == project.workspace_id,
            (model.project_id.is_(None)) | (model.project_id != project.id),
        ),
    )
    if kind == "drive":
        query = query.where(DriveItem.is_folder.is_(True))
    if q.strip():
        query = query.where(
            func.lower(title).like(f"%{escape_like(q.strip().lower())}%", escape="\\")
        )
    rows = db.scalars(query.order_by(model.id.desc()).limit(40)).all()
    return [_item(kind, row) for row in rows]


def project_folder(db: Session, ctx: Ctx, project: Project) -> LinkedItem:
    """The project's own folder in My Drive (created on first use)."""
    existing = db.scalar(
        select(DriveItem).where(
            DriveItem.project_id == project.id,
            DriveItem.is_folder.is_(True),
            DriveItem.trashed_at.is_(None),
        )
    )
    if existing is None:
        existing = drive_service.create_folder(
            db, ctx, project.name[:255] or "Project", None, None, "files", project.id
        )
    return _item("drive", existing)


def calendar_events(db: Session, ctx: Ctx, start: day_type, end: day_type) -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    for project in db.scalars(
        select(Project).where(Project.workspace_id == ctx.ws_id, Project.archived.is_(False))
    ):
        url = f"/projects/{project.id}"
        icon = project.icon or "🚀"
        if project.start_date and start <= project.start_date <= end:
            events.append(
                CalendarEvent(
                    id=f"ps{project.id}",
                    kind="project_start",
                    date=project.start_date,
                    title=f"{icon} {project.name}",
                    url=url,
                    color=project.color,
                )
            )
        if project.end_date and start <= project.end_date <= end:
            events.append(
                CalendarEvent(
                    id=f"pe{project.id}",
                    kind="project_end",
                    date=project.end_date,
                    title=f"{icon} {project.name}",
                    url=url,
                    color=project.color,
                    done=project.status == "completed",
                )
            )
        for index, milestone in enumerate(project.milestones or []):
            try:
                day = day_type.fromisoformat(str(milestone.get("date") or "")[:10])
            except ValueError:
                continue
            if start <= day <= end:
                events.append(
                    CalendarEvent(
                        id=f"m{project.id}-{index}",
                        kind="milestone",
                        date=day,
                        title=str(milestone.get("title") or ""),
                        subtitle=project.name,
                        url=url,
                        color=project.color,
                        done=bool(milestone.get("done")),
                    )
                )
    for card, board_title, board_id in db.execute(
        select(BoardCard, Board.title, Board.id)
        .join(BoardList, BoardList.id == BoardCard.list_id)
        .join(Board, Board.id == BoardList.board_id)
        .where(
            Board.workspace_id == ctx.ws_id,
            BoardCard.archived.is_(False),
            BoardCard.due_date.is_not(None),
            BoardCard.due_date >= start,
            BoardCard.due_date <= end,
        )
    ):
        events.append(
            CalendarEvent(
                id=f"c{card.id}",
                kind="card",
                date=card.due_date,
                title=card.title,
                subtitle=board_title,
                url=f"/boards/{board_id}?card={card.id}",
                color="blue",
                done=card.due_done,
            )
        )
    for alarm in db.scalars(
        select(Alarm).where(
            Alarm.user_id == ctx.user_id,
            Alarm.repeat == "once",
            Alarm.date >= start,
            Alarm.date <= end,
        )
    ):
        assert alarm.date is not None
        events.append(
            CalendarEvent(
                id=f"a{alarm.id}",
                kind="alarm",
                date=alarm.date,
                title=f"⏰ {alarm.time} {alarm.title}",
                url=f"/alarms?alarm={alarm.id}",
                color=alarm.color,
                done=not alarm.enabled,
            )
        )
    events.sort(key=lambda e: (e.date, e.kind))
    return events
