"""Liveness/readiness check used by Docker Compose."""

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DbSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", summary="Backend and database health", response_model=None)
def health(db: DbSession) -> dict[str, str] | JSONResponse:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Health check: database is not reachable")
        return JSONResponse(status_code=503, content={"status": "error", "database": "down"})
    return {"status": "ok", "database": "ok"}
