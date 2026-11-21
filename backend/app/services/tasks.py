"""To-do items. Every query is limited to one workspace."""

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Task
from app.schemas.task import TaskCreate
from app.services import categories as categories_service
from app.services.access import Ctx


def list_tasks(
    db: Session,
    ws_id: int,
    done: bool | None = None,
    category_id: int | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
) -> list[Task]:
    """Open first, then by due date (undated last), then oldest first."""
    query = select(Task).where(Task.workspace_id == ws_id)
    if done is not None:
        query = query.where(Task.is_done.is_(done))
    if category_id is not None:
        query = query.where(Task.category_id == category_id)
    if due_from is not None:
        query = query.where(Task.due_date >= due_from)
    if due_to is not None:
        query = query.where(Task.due_date <= due_to)
    query = query.order_by(Task.is_done, Task.due_date.asc().nulls_last(), Task.id)
    return list(db.scalars(query))


def get_task(db: Session, ws_id: int, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.workspace_id != ws_id:
        raise NotFoundError("Task not found.", code="task_not_found")
    return task


def create_task(db: Session, ctx: Ctx, data: TaskCreate) -> Task:
    ctx.require_edit()
    categories_service.ensure_owned(db, ctx.ws_id, data.category_id)
    task = Task(
        user_id=ctx.user_id,
        workspace_id=ctx.ws_id,
        title=data.title,
        due_date=data.due_date,
        category_id=data.category_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def create_many(db: Session, ctx: Ctx, items: list[TaskCreate]) -> list[Task]:
    ctx.require_edit()
    rows = []
    for data in items:
        categories_service.ensure_owned(db, ctx.ws_id, data.category_id)
        rows.append(
            Task(
                user_id=ctx.user_id,
                workspace_id=ctx.ws_id,
                title=data.title,
                due_date=data.due_date,
                category_id=data.category_id,
            )
        )
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def update_task(db: Session, task: Task, changes: dict[str, Any]) -> Task:
    if "category_id" in changes:
        categories_service.ensure_owned(db, task.workspace_id, changes["category_id"])
    if "is_done" in changes and changes["is_done"] != task.is_done:
        task.completed_at = datetime.now(UTC) if changes["is_done"] else None
    for field, value in changes.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: Task) -> None:
    db.delete(task)
    db.commit()
