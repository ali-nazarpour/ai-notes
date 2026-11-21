"""Project routes."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from app.api.deps import DbSession, WorkspaceCtx
from app.schemas.content import ProjectCreate, ProjectRead, ProjectSummary, ProjectUpdate
from app.services import project_links
from app.services import projects as service

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectSummary], summary="Projects in this workspace")
def list_projects(ctx: WorkspaceCtx, db: DbSession, archived: bool = False) -> list[ProjectSummary]:
    return service.list_projects(db, ctx.ws_id, archived)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, ctx: WorkspaceCtx, db: DbSession) -> ProjectRead:
    return service.project_read(db, ctx, service.create_project(db, ctx, body))


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, ctx: WorkspaceCtx, db: DbSession) -> ProjectRead:
    return service.project_read(db, ctx, service.get_project(db, ctx, project_id))


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int, body: ProjectUpdate, ctx: WorkspaceCtx, db: DbSession
) -> ProjectRead:
    project = service.get_project(db, ctx, project_id, write=True)
    changes = body.model_dump(exclude_unset=True)
    return service.project_read(db, ctx, service.update_project(db, project, changes))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_project(db, service.get_project(db, ctx, project_id, write=True))


LinkKind = Literal["note", "task", "board", "doc", "deck", "drive"]


class LinkBody(BaseModel):
    kind: LinkKind
    item_id: int


@router.get(
    "/{project_id}/links",
    response_model=dict[str, list[project_links.LinkedItem]],
    summary="Notes, tasks, boards, documents, presentations and drive items of the project",
)
def get_links(
    project_id: int, ctx: WorkspaceCtx, db: DbSession
) -> dict[str, list[project_links.LinkedItem]]:
    return project_links.links(db, service.get_project(db, ctx, project_id))


@router.post("/{project_id}/links", response_model=project_links.LinkedItem, summary="Link an item")
def add_link(
    project_id: int, body: LinkBody, ctx: WorkspaceCtx, db: DbSession
) -> project_links.LinkedItem:
    project = service.get_project(db, ctx, project_id, write=True)
    return project_links.link(db, ctx, project, body.kind, body.item_id)


@router.delete("/{project_id}/links/{kind}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_link(
    project_id: int, kind: LinkKind, item_id: int, ctx: WorkspaceCtx, db: DbSession
) -> None:
    project = service.get_project(db, ctx, project_id, write=True)
    project_links.unlink(db, ctx, project, kind, item_id)


@router.get(
    "/{project_id}/link-options",
    response_model=list[project_links.LinkedItem],
    summary="Items that can be linked to the project",
)
def link_options(
    project_id: int,
    ctx: WorkspaceCtx,
    db: DbSession,
    kind: LinkKind,
    q: Annotated[str, Query(max_length=200)] = "",
) -> list[project_links.LinkedItem]:
    return project_links.options(db, service.get_project(db, ctx, project_id), kind, q)


@router.post(
    "/{project_id}/drive-folder",
    response_model=project_links.LinkedItem,
    summary="The project's folder in My Drive (created on first use)",
)
def drive_folder(project_id: int, ctx: WorkspaceCtx, db: DbSession) -> project_links.LinkedItem:
    project = service.get_project(db, ctx, project_id, write=True)
    return project_links.project_folder(db, ctx, project)
