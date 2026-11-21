"""Small helpers shared by several schema files."""

from typing import ClassVar

from pydantic import BaseModel, model_validator


class PartialUpdate(BaseModel):
    """
    Base for PATCH bodies. Routes read ``model_dump(exclude_unset=True)``, so only fields
    present in the JSON change. ``null`` clears a field, except for the fields listed in
    NOT_NULLABLE, which are rejected with 422.
    """

    NOT_NULLABLE: ClassVar[tuple[str, ...]] = ()

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> "PartialUpdate":
        for field in self.NOT_NULLABLE:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self


def strip_required(value: str, field: str) -> str:
    """Removes surrounding spaces and rejects a value that is only spaces."""
    value = value.strip()
    if not value:
        raise ValueError(f"{field} must not be blank.")
    return value
