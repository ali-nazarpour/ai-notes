"""Global search over every section of the current workspace."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession, WorkspaceCtx
from app.schemas.v5 import SearchResult
from app.services import search as service

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=list[SearchResult], summary="Search the whole workspace")
def search(
    ctx: WorkspaceCtx,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=200)],
    per_kind: Annotated[int, Query(ge=1, le=50)] = 6,
) -> list[SearchResult]:
    return service.search(db, ctx.ws_id, q, per_kind, ctx.user_id)
