"""Pydantic schemas for categories."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.palette import ColorName
from app.schemas.common import strip_required


class CategoryInput(BaseModel):
    """Body of POST /api/categories and PUT /api/categories/{id}."""

    name: str = Field(min_length=1, max_length=50, examples=["English learning"])
    color: ColorName = Field(examples=["blue"])
    icon: str = Field(default="", max_length=16, description="Optional emoji.", examples=["📚"])

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        return strip_required(value, "Name")

    @field_validator("icon")
    @classmethod
    def strip_icon(cls, value: str) -> str:
        return value.strip()


class CategoryRead(CategoryInput):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    # Counts are computed by the server, so the sidebar can show them without loading
    # every note and task.
    note_count: int = 0
    open_task_count: int = 0
