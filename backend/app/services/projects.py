"""
Projects. Progress is either set by hand or, when left empty, the share of completed
milestones. The amount spent is the sum of the expenses.
"""

from decimal import Decimal
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import InvalidInputError, NotFoundError
from app.models import Board, DocSpace, Project, Share
from app.schemas.content import ProjectCreate, ProjectRead, ProjectSummary
from app.services import categories as categories_service
from app.services.access import Ctx, check, item_role

_JSON_LISTS = ("members", "milestones", "expenses", "repositories", "links", "files", "notes")


def _missing() -> NotFoundError:
    return NotFoundError("Project not found.", code="project_not_found")


def get_project(db: Session, ctx: Ctx, project_id: int, *, write: bool = False) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise _missing()
    check(db, ctx, "project", project.workspace_id, project.id, write=write, missing=_missing())
    return project


def _progress(project: Project) -> int:
    if project.progress is not None:
        return project.progress
    milestones = project.milestones or []
    if not milestones:
        return 100 if project.status == "completed" else 0
    return round(100 * sum(1 for m in milestones if m.get("done")) / len(milestones))


def _spent(project: Project) -> Decimal:
    return sum((Decimal(str(e.get("amount") or 0)) for e in project.expenses or []), Decimal(0))


def _fill(read: Any, project: Project) -> Any:
    read.progress = _progress(project)
    read.spent = _spent(project)
    read.member_count = len(project.members or [])
    read.milestone_count = len(project.milestones or [])
    read.milestones_done = sum(1 for m in project.milestones or [] if m.get("done"))
    return read


def _summary_data(project: Project) -> dict[str, Any]:
    data = {c.key: getattr(project, c.key) for c in Project.__table__.columns}
    data["progress"] = _progress(project)
    return data


def list_projects(db: Session, ws_id: int, archived: bool = False) -> list[ProjectSummary]:
    rows = db.scalars(
        select(Project)
        .where(Project.workspace_id == ws_id, Project.archived.is_(archived))
        .order_by(Project.starred.desc(), Project.updated_at.desc())
    ).all()
    return [_fill(ProjectSummary.model_validate(_summary_data(p)), p) for p in rows]


def project_read(db: Session, ctx: Ctx, project: Project) -> ProjectRead:
    data = _summary_data(project)
    data["manual_progress"] = project.progress
    for key in _JSON_LISTS:
        data[key] = data[key] or []
    read = _fill(ProjectRead.model_validate(data), project)
    read.role = item_role(db, ctx, "project", project.workspace_id, project.id) or "viewer"
    read.shared = (
        project.workspace_id != ctx.ws_id
        and read.role in ("editor", "viewer")
        and (
            db.scalar(
                select(Share.id).where(
                    Share.kind == "project",
                    Share.item_id == project.id,
                    Share.user_id == ctx.user_id,
                )
            )
            is not None
        )
    )
    return read


def create_project(db: Session, ctx: Ctx, data: ProjectCreate) -> Project:
    ctx.require_edit()
    project = Project(
        workspace_id=ctx.ws_id,
        user_id=ctx.user_id,
        name=data.name,
        summary=data.summary,
        kind=data.kind,
        status=data.status,
        color=data.color,
        icon=data.icon,
        start_date=data.start_date,
        end_date=data.end_date,
        currency="IRR" if ctx.user.language == "fa" else "USD",
        members=[],
        milestones=[],
        expenses=[],
        repositories=[],
        links=[],
        files=[],
        notes=[],
        tags=[],
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, project: Project, changes: dict[str, Any]) -> Project:
    if "category_id" in changes:
        categories_service.ensure_owned(db, project.workspace_id, changes["category_id"])
    if changes.get("board_id") is not None:
        board = db.get(Board, changes["board_id"])
        if board is None or board.workspace_id != project.workspace_id:
            raise InvalidInputError("Board not found.", code="board_not_found")
    if changes.get("doc_space_id") is not None:
        space = db.get(DocSpace, changes["doc_space_id"])
        if space is None or space.workspace_id != project.workspace_id:
            raise InvalidInputError("Documentation not found.", code="doc_not_found")
    start = changes.get("start_date", project.start_date)
    end = changes.get("end_date", project.end_date)
    if start and end and end < start:
        raise InvalidInputError("The end date is before the start date.", code="date_order")
    for key, value in changes.items():
        if key in _JSON_LISTS and value is not None:
            value = [_jsonable(item) for item in value]
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


def _jsonable(item: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in item.items():
        if isinstance(value, Decimal):
            out[key] = float(value)
        elif hasattr(value, "isoformat"):
            out[key] = value.isoformat()
        else:
            out[key] = value
    return out


def delete_project(db: Session, project: Project) -> None:
    db.execute(delete(Share).where(Share.kind == "project", Share.item_id == project.id))
    db.delete(project)
    db.commit()
