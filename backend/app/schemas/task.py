"""
Pydantic schemas for tasks (the to-do list).

Tasks use PATCH for updates, unlike notes (which use PUT). Ticking a checkbox or moving a
task to tomorrow changes one field, and PATCH lets the client send only that field:
    PATCH /api/tasks/7   {"is_done": true}
"""

from datetime import date, datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.task import TASK_TITLE_MAX_LENGTH
from app.schemas.common import PartialUpdate, strip_required


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=TASK_TITLE_MAX_LENGTH, examples=["Buy milk"])
    due_date: date | None = Field(default=None, examples=["2026-11-14"])
    category_id: int | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        return strip_required(value, "Title")


class TaskUpdate(PartialUpdate):
    """
    Body of PATCH /api/tasks/{id}.

    due_date: null and category_id: null are allowed and mean "remove it".
    title: null and is_done: null make no sense and are rejected.
    """

    NOT_NULLABLE: ClassVar[tuple[str, ...]] = ("title", "is_done")

    title: str | None = Field(default=None, min_length=1, max_length=TASK_TITLE_MAX_LENGTH)
    is_done: bool | None = None
    due_date: date | None = None
    category_id: int | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str | None) -> str | None:
        return strip_required(value, "Title") if value is not None else None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    is_done: bool
    due_date: date | None
    category_id: int | None
    created_at: datetime
    completed_at: datetime | None
