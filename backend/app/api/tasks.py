"""Task routes (per workspace)."""

from datetime import date

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.api.deps import DbSession, WorkspaceCtx
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services import tasks as tasks_service

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskBatch(BaseModel):
    tasks: list[TaskCreate] = Field(min_length=1, max_length=50)


@router.get("", response_model=list[TaskRead], summary="List or filter tasks")
def list_tasks(
    ctx: WorkspaceCtx,
    db: DbSession,
    done: bool | None = None,
    category_id: int | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
) -> list[TaskRead]:
    tasks = tasks_service.list_tasks(db, ctx.ws_id, done, category_id, due_from, due_to)
    return [TaskRead.model_validate(task) for task in tasks]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED, summary="Create")
def create_task(body: TaskCreate, ctx: WorkspaceCtx, db: DbSession) -> TaskRead:
    return TaskRead.model_validate(tasks_service.create_task(db, ctx, body))


@router.post(
    "/batch",
    response_model=list[TaskRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create several tasks (e.g. from AI suggestions)",
)
def create_tasks(body: TaskBatch, ctx: WorkspaceCtx, db: DbSession) -> list[TaskRead]:
    return [TaskRead.model_validate(t) for t in tasks_service.create_many(db, ctx, body.tasks)]


@router.patch("/{task_id}", response_model=TaskRead, summary="Change some fields")
def update_task(task_id: int, body: TaskUpdate, ctx: WorkspaceCtx, db: DbSession) -> TaskRead:
    ctx.require_edit()
    task = tasks_service.get_task(db, ctx.ws_id, task_id)
    updated = tasks_service.update_task(db, task, body.model_dump(exclude_unset=True))
    return TaskRead.model_validate(updated)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete")
def delete_task(task_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    ctx.require_edit()
    tasks_service.delete_task(db, tasks_service.get_task(db, ctx.ws_id, task_id))
