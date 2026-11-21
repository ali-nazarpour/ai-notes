"""Note routes: CRUD, trash, version history."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, WorkspaceCtx
from app.schemas.note import (
    NoteCreate,
    NoteRead,
    NoteSummary,
    NoteUpdate,
    RevisionRead,
    RevisionSummary,
)
from app.services import notes as notes_service
from app.services import revisions

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("", response_model=list[NoteSummary], summary="List, search or filter notes")
def list_notes(
    ctx: WorkspaceCtx,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=200)] = None,
    favorite: bool | None = None,
    category_id: int | None = None,
) -> list[NoteSummary]:
    notes = notes_service.list_notes(db, ctx.ws_id, search, favorite, category_id)
    return [NoteSummary.model_validate(note) for note in notes]


@router.get("/trash", response_model=list[NoteSummary], summary="Notes in the trash")
def trash(ctx: WorkspaceCtx, db: DbSession) -> list[NoteSummary]:
    notes = notes_service.list_notes(db, ctx.ws_id, trashed=True)
    return [NoteSummary.model_validate(note) for note in notes]


@router.delete("/trash", summary="Delete every note in the trash for good")
def empty_trash(ctx: WorkspaceCtx, db: DbSession) -> dict[str, int]:
    return {"deleted": notes_service.empty_trash(db, ctx)}


@router.post(
    "", response_model=NoteRead, status_code=status.HTTP_201_CREATED, summary="Create a note"
)
def create_note(data: NoteCreate, ctx: WorkspaceCtx, db: DbSession) -> NoteRead:
    return notes_service.note_read(db, ctx, notes_service.create_note(db, ctx, data))


@router.get("/{note_id}", response_model=NoteRead, summary="Get one note")
def get_note(note_id: int, ctx: WorkspaceCtx, db: DbSession) -> NoteRead:
    return notes_service.note_read(db, ctx, notes_service.get_note(db, ctx, note_id))


@router.patch(
    "/{note_id}",
    response_model=NoteRead,
    summary="Change some fields of a note (only the fields that are sent)",
)
def update_note(note_id: int, data: NoteUpdate, ctx: WorkspaceCtx, db: DbSession) -> NoteRead:
    note = notes_service.get_note(db, ctx, note_id, write=True)
    updated = notes_service.update_note(db, ctx, note, data.model_dump(exclude_unset=True))
    return notes_service.note_read(db, ctx, updated)


@router.post("/{note_id}/trash", status_code=status.HTTP_204_NO_CONTENT, summary="Move to trash")
def trash_note(note_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    notes_service.trash_note(db, notes_service.get_note(db, ctx, note_id, write=True))


@router.post("/{note_id}/restore", response_model=NoteRead, summary="Restore from the trash")
def restore_note(note_id: int, ctx: WorkspaceCtx, db: DbSession) -> NoteRead:
    note = notes_service.restore_note(db, notes_service.get_note(db, ctx, note_id, write=True))
    return notes_service.note_read(db, ctx, note)


@router.delete(
    "/{note_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a note for good"
)
def delete_note(note_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    notes_service.delete_note(db, notes_service.get_note(db, ctx, note_id, write=True))


@router.get("/{note_id}/revisions", response_model=list[RevisionSummary], summary="Version history")
def list_revisions(note_id: int, ctx: WorkspaceCtx, db: DbSession) -> list[RevisionSummary]:
    note = notes_service.get_note(db, ctx, note_id)
    return [RevisionSummary(**row) for row in revisions.list_revisions(db, "note", note.id)]


@router.get("/{note_id}/revisions/{revision_id}", response_model=RevisionRead)
def get_revision(note_id: int, revision_id: int, ctx: WorkspaceCtx, db: DbSession) -> RevisionRead:
    note = notes_service.get_note(db, ctx, note_id)
    return RevisionRead.model_validate(revisions.get_revision(db, "note", note.id, revision_id))


@router.post("/{note_id}/revisions/{revision_id}/restore", response_model=NoteRead)
def restore_revision(note_id: int, revision_id: int, ctx: WorkspaceCtx, db: DbSession) -> NoteRead:
    note = notes_service.get_note(db, ctx, note_id, write=True)
    return notes_service.note_read(
        db, ctx, notes_service.restore_revision(db, ctx, note, revision_id)
    )
