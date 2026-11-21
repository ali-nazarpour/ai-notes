"""Documentation routes: spaces, the page tree, search, version history and Ask-the-docs."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import AppSettings, DbSession, Ollama, WorkspaceCtx
from app.schemas.content import (
    AskRequest,
    AskResponse,
    DocPageCreate,
    DocPageMove,
    DocPageNode,
    DocPageRead,
    DocPagesBatch,
    DocPageUpdate,
    DocSpaceCreate,
    DocSpaceRead,
    DocSpaceSummary,
    DocSpaceUpdate,
    SearchHit,
)
from app.schemas.note import RevisionRead, RevisionSummary
from app.services import docs as service
from app.services import revisions

router = APIRouter(prefix="/api/docs", tags=["documentation"])


@router.get("", response_model=list[DocSpaceSummary], summary="Documentation in this workspace")
def list_spaces(ctx: WorkspaceCtx, db: DbSession) -> list[DocSpaceSummary]:
    return service.list_spaces(db, ctx.ws_id)


@router.post("", response_model=DocSpaceRead, status_code=status.HTTP_201_CREATED)
def create_space(body: DocSpaceCreate, ctx: WorkspaceCtx, db: DbSession) -> DocSpaceRead:
    return service.space_read(db, ctx, service.create_space(db, ctx, body))


@router.get("/{space_id}", response_model=DocSpaceRead, summary="A space with its page tree")
def get_space(space_id: int, ctx: WorkspaceCtx, db: DbSession) -> DocSpaceRead:
    return service.space_read(db, ctx, service.get_space(db, ctx, space_id))


@router.patch("/{space_id}", response_model=DocSpaceRead)
def update_space(
    space_id: int, body: DocSpaceUpdate, ctx: WorkspaceCtx, db: DbSession
) -> DocSpaceRead:
    space = service.get_space(db, ctx, space_id, write=True)
    service.update_space(db, space, body.model_dump(exclude_unset=True))
    return service.space_read(db, ctx, space)


@router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_space(space_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_space(db, service.get_space(db, ctx, space_id, write=True))


@router.get("/{space_id}/search", response_model=list[SearchHit])
def search(
    space_id: int,
    ctx: WorkspaceCtx,
    db: DbSession,
    q: Annotated[str, Query(max_length=200)] = "",
) -> list[SearchHit]:
    return service.search(db, service.get_space(db, ctx, space_id), q)


@router.post("/{space_id}/ask", response_model=AskResponse, summary="Ask the AI about these docs")
async def ask(
    space_id: int,
    body: AskRequest,
    ctx: WorkspaceCtx,
    db: DbSession,
    settings: AppSettings,
    ollama: Ollama,
) -> AskResponse:
    space = service.get_space(db, ctx, space_id)
    return await service.ask(db, ollama, settings, space, body.question, body.thorough)


# --- Pages ---


@router.post("/{space_id}/pages", response_model=DocPageRead, status_code=status.HTTP_201_CREATED)
def create_page(
    space_id: int, body: DocPageCreate, ctx: WorkspaceCtx, db: DbSession
) -> DocPageRead:
    space = service.get_space(db, ctx, space_id, write=True)
    return service.page_read(db, service.create_page(db, ctx, space, body))


@router.post(
    "/{space_id}/pages/batch",
    response_model=list[DocPageNode],
    status_code=status.HTTP_201_CREATED,
    summary="Create several pages at once (e.g. an AI outline)",
)
def create_pages(
    space_id: int, body: DocPagesBatch, ctx: WorkspaceCtx, db: DbSession
) -> list[DocPageNode]:
    space = service.get_space(db, ctx, space_id, write=True)
    pages = service.create_pages(db, ctx, space, body.parent_id, body.pages)
    return [DocPageNode.model_validate(p) for p in pages]


@router.get("/{space_id}/pages/{page_id}", response_model=DocPageRead)
def get_page(space_id: int, page_id: int, ctx: WorkspaceCtx, db: DbSession) -> DocPageRead:
    space = service.get_space(db, ctx, space_id)
    return service.page_read(db, service.get_page(db, space, page_id))


@router.patch("/{space_id}/pages/{page_id}", response_model=DocPageRead)
def update_page(
    space_id: int, page_id: int, body: DocPageUpdate, ctx: WorkspaceCtx, db: DbSession
) -> DocPageRead:
    space = service.get_space(db, ctx, space_id, write=True)
    page = service.get_page(db, space, page_id)
    updated = service.update_page(db, ctx, space, page, body.model_dump(exclude_unset=True))
    return service.page_read(db, updated)


@router.post("/{space_id}/pages/{page_id}/move", status_code=status.HTTP_204_NO_CONTENT)
def move_page(
    space_id: int, page_id: int, body: DocPageMove, ctx: WorkspaceCtx, db: DbSession
) -> None:
    space = service.get_space(db, ctx, space_id, write=True)
    service.move_page(db, space, service.get_page(db, space, page_id), body.parent_id, body.index)


@router.post(
    "/{space_id}/pages/{page_id}/duplicate",
    response_model=DocPageRead,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_page(space_id: int, page_id: int, ctx: WorkspaceCtx, db: DbSession) -> DocPageRead:
    space = service.get_space(db, ctx, space_id, write=True)
    suffix = "(کپی)" if ctx.user.language == "fa" else "(copy)"
    copy = service.duplicate_page(db, ctx, space, service.get_page(db, space, page_id), suffix)
    return service.page_read(db, copy)


@router.delete(
    "/{space_id}/pages/{page_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a page and its sub-pages",
)
def delete_page(space_id: int, page_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    space = service.get_space(db, ctx, space_id, write=True)
    service.delete_page(db, space, service.get_page(db, space, page_id))


@router.get("/{space_id}/pages/{page_id}/revisions", response_model=list[RevisionSummary])
def list_revisions(
    space_id: int, page_id: int, ctx: WorkspaceCtx, db: DbSession
) -> list[RevisionSummary]:
    page = service.get_page(db, service.get_space(db, ctx, space_id), page_id)
    return [RevisionSummary(**r) for r in revisions.list_revisions(db, "doc_page", page.id)]


@router.get("/{space_id}/pages/{page_id}/revisions/{revision_id}", response_model=RevisionRead)
def get_revision(
    space_id: int, page_id: int, revision_id: int, ctx: WorkspaceCtx, db: DbSession
) -> RevisionRead:
    page = service.get_page(db, service.get_space(db, ctx, space_id), page_id)
    return RevisionRead.model_validate(revisions.get_revision(db, "doc_page", page.id, revision_id))


@router.post(
    "/{space_id}/pages/{page_id}/revisions/{revision_id}/restore", response_model=DocPageRead
)
def restore_revision(
    space_id: int, page_id: int, revision_id: int, ctx: WorkspaceCtx, db: DbSession
) -> DocPageRead:
    space = service.get_space(db, ctx, space_id, write=True)
    page = service.get_page(db, space, page_id)
    return service.page_read(db, service.restore_revision(db, ctx, space, page, revision_id))
