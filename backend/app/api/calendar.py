"""Calendar events besides tasks: project dates and milestones, board cards, alarms."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession, WorkspaceCtx
from app.core.errors import InvalidInputError
from app.services import project_links

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/events", response_model=list[project_links.CalendarEvent])
def events(
    ctx: WorkspaceCtx,
    db: DbSession,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
) -> list[project_links.CalendarEvent]:
    if end < start or (end - start).days > 400:
        raise InvalidInputError("Choose a range of up to 400 days.", code="invalid_range")
    return project_links.calendar_events(db, ctx, start, end)
