"""Drive routes: folders, uploads of any file type, trash, stars, public links, ZIP download."""

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, Storage, WorkspaceCtx
from app.schemas.v5 import (
    DriveItemRead,
    DriveItemUpdate,
    DriveLink,
    DriveLinkRead,
    DriveListing,
    DriveSection,
    DriveUsage,
    DriveView,
    FolderCreate,
    PublicDrive,
)
from app.services import drive as service

router = APIRouter(prefix="/api/drive", tags=["drive"])
public = APIRouter(prefix="/api/public/drive", tags=["drive"])


def _zip_response(body: object, size: int, name: str) -> StreamingResponse:
    filename = f"{name or 'folder'}.zip"
    ascii_name = filename.encode("ascii", "ignore").decode().replace('"', "") or "folder.zip"
    return StreamingResponse(
        body,  # type: ignore[arg-type]
        media_type="application/zip",
        headers={
            "Content-Length": str(size),
            "Content-Disposition": (
                f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"
            ),
        },
    )


@router.get("", response_model=DriveListing, summary="A folder, or a view (recent, starred...)")
def list_items(
    ctx: WorkspaceCtx,
    db: DbSession,
    view: DriveView = "folder",
    folder: int | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    section: DriveSection = "files",
) -> DriveListing:
    return service.listing(db, ctx, view, folder, q, section)


@router.get("/usage", response_model=DriveUsage, summary="Space used and the limits")
def usage(ctx: WorkspaceCtx, db: DbSession) -> DriveUsage:
    return service.usage(db, ctx.ws_id)


@router.get("/folders", summary="All folders (for moving items)")
def folders(
    ctx: WorkspaceCtx, db: DbSession, section: DriveSection = "files"
) -> list[dict[str, object]]:
    return service.folders_tree(db, ctx, section)


@router.post("/folders", response_model=DriveItemRead, status_code=status.HTTP_201_CREATED)
def create_folder(body: FolderCreate, ctx: WorkspaceCtx, db: DbSession) -> DriveItemRead:
    folder = service.create_folder(db, ctx, body.name, body.parent_id, body.color, body.section)
    return service.read_items(db, [folder])[0]


@router.post(
    "/upload",
    response_model=DriveItemRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a file of any type",
)
def upload(
    ctx: WorkspaceCtx,
    db: DbSession,
    storage: Storage,
    file: Annotated[UploadFile, File()],
    parent_id: Annotated[int | None, Form()] = None,
    relative_path: Annotated[str, Form(max_length=1000)] = "",
    section: Annotated[DriveSection, Form()] = "files",
) -> DriveItemRead:
    item = service.upload(
        db, storage, ctx, parent_id, file.file, file.filename or "", relative_path, section
    )
    return service.read_items(db, [item])[0]


@router.get("/items/{item_id}", response_model=DriveItemRead)
def get_item(item_id: int, ctx: WorkspaceCtx, db: DbSession) -> DriveItemRead:
    return service.read_items(db, [service.get_item(db, ctx, item_id)])[0]


@router.patch("/items/{item_id}", response_model=DriveItemRead, summary="Rename, move, star")
def update_item(
    item_id: int, body: DriveItemUpdate, ctx: WorkspaceCtx, db: DbSession
) -> DriveItemRead:
    item = service.get_item(db, ctx, item_id, write=True)
    item = service.update(db, ctx, item, body.model_dump(exclude_unset=True))
    return service.read_items(db, [item])[0]


@router.post("/items/{item_id}/trash", status_code=status.HTTP_204_NO_CONTENT)
def trash_item(item_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.trash(db, service.get_item(db, ctx, item_id, write=True))


@router.post("/items/{item_id}/restore", response_model=DriveItemRead)
def restore_item(item_id: int, ctx: WorkspaceCtx, db: DbSession) -> DriveItemRead:
    item = service.restore(db, service.get_item(db, ctx, item_id, write=True))
    return service.read_items(db, [item])[0]


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, ctx: WorkspaceCtx, db: DbSession, storage: Storage) -> None:
    service.delete_forever(db, storage, [service.get_item(db, ctx, item_id, write=True)])


@router.delete("/trash", status_code=status.HTTP_204_NO_CONTENT, summary="Empty the trash")
def empty_trash(ctx: WorkspaceCtx, db: DbSession, storage: Storage) -> None:
    service.empty_trash(db, storage, ctx)


@router.put("/items/{item_id}/link", response_model=DriveLinkRead, summary="Public link on/off")
def set_link(item_id: int, body: DriveLink, ctx: WorkspaceCtx, db: DbSession) -> DriveLinkRead:
    item = service.get_item(db, ctx, item_id, write=True)
    return DriveLinkRead(token=service.set_link(db, item, body.enabled))


@router.get("/items/{item_id}/link", response_model=DriveLinkRead)
def get_link(item_id: int, ctx: WorkspaceCtx, db: DbSession) -> DriveLinkRead:
    return DriveLinkRead(token=service.get_item(db, ctx, item_id).link_token)


@router.get("/items/{item_id}/zip", summary="Download a folder as a ZIP file")
def download_zip(
    item_id: int, ctx: WorkspaceCtx, db: DbSession, storage: Storage
) -> StreamingResponse:
    folder = service.get_item(db, ctx, item_id)
    body, size = service.zip_folder(db, storage, folder)
    return _zip_response(body, size, folder.name)


@public.get("/{token}", response_model=PublicDrive, summary="A publicly shared file or folder")
def public_item(token: str, db: DbSession, folder: int | None = None) -> PublicDrive:
    return service.public_view(db, token, folder)


@public.get("/{token}/zip", summary="Download a publicly shared folder as ZIP")
def public_zip(
    token: str, db: DbSession, storage: Storage, folder: int | None = None
) -> StreamingResponse:
    body, size, name = service.public_zip(db, storage, token, folder)
    return _zip_response(body, size, name)
