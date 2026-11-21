"""
File routes.

Uploading requires a signed-in user. Downloading does not: ``<img>`` and ``<video>`` tags
cannot send an Authorization header, so the random UUID in the URL acts as the key
("capability URL"). Anyone who has the exact URL can view the file, nobody can list files.
"""

import uuid
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, File, Header, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import AppSettings, CurrentUser, DbSession, Storage
from app.schemas.file import FileRead
from app.services import files as files_service
from app.services import link_preview as link_preview_service

router = APIRouter(prefix="/api/files", tags=["files"])


class LinkPreview(BaseModel):
    url: str
    title: str
    description: str
    image: str | None
    site_name: str
    favicon: str | None


@router.post(
    "",
    response_model=FileRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an image, video, audio file or document",
)
def upload_file(
    file: Annotated[UploadFile, File(description="Image, video, audio or document")],
    user: CurrentUser,
    db: DbSession,
    storage: Storage,
    settings: AppSettings,
) -> FileRead:
    row = files_service.store_upload(db, storage, settings, user.id, file.file, file.filename or "")
    return FileRead.model_validate(row)


@router.get("/{file_id}", summary="Download a file (supports Range requests)")
def download_file(
    file_id: uuid.UUID,
    db: DbSession,
    storage: Storage,
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> StreamingResponse:
    row = files_service.get_file(db, file_id)
    download = files_service.open_download(storage, row, range_header)
    return StreamingResponse(
        download.body,
        status_code=download.status,
        media_type=row.content_type,
        headers=download.headers,
    )


@router.get(
    "/preview/link",
    response_model=LinkPreview,
    summary="Title, description and image of a web page (for bookmark blocks)",
)
def link_preview(
    url: Annotated[str, Query(min_length=8, max_length=2000)],
    _user: CurrentUser,
    settings: AppSettings,
) -> LinkPreview:
    return LinkPreview(**asdict(link_preview_service.fetch(settings, url)))
