"""Backup export / import of the current workspace (and your encrypted vault)."""

from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, UploadFile
from fastapi.responses import StreamingResponse

from app.api.deps import AppSettings, DbSession, Storage, WorkspaceCtx
from app.services import data_transfer

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("/summary", summary="How much data the account has")
def summary(ctx: WorkspaceCtx, db: DbSession) -> dict[str, int]:
    return data_transfer.counts(db, ctx)


@router.get(
    "/export",
    summary="Download everything as a ZIP backup",
    response_class=StreamingResponse,
    responses={200: {"content": {"application/zip": {}}}},
)
def export(ctx: WorkspaceCtx, db: DbSession, storage: Storage) -> StreamingResponse:
    handle, size = data_transfer.export_zip(db, storage, ctx)
    name = f"ai-notes-{ctx.workspace.slug}-{datetime.now(UTC):%Y-%m-%d}.zip"
    return StreamingResponse(
        data_transfer.iter_file(handle),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Content-Length": str(size),
            "Cache-Control": "no-store",
        },
    )


@router.post("/import", summary="Add the contents of a ZIP backup to this account")
def import_backup(
    file: UploadFile, ctx: WorkspaceCtx, db: DbSession, storage: Storage, settings: AppSettings
) -> dict[str, Any]:
    ctx.require_edit()
    result = data_transfer.import_zip(db, storage, settings, ctx, file.file)
    return asdict(result)
