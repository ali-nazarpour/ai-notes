"""Blog routes, plus the public (no sign-in) pages of a workspace's blog."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, WorkspaceCtx
from app.schemas.content import PostCreate, PostRead, PostSummary, PostUpdate, PublicBlog
from app.schemas.note import RevisionRead, RevisionSummary
from app.services import blog as service
from app.services import revisions

router = APIRouter(prefix="/api/blog", tags=["blog"])
public = APIRouter(prefix="/api/public/blog", tags=["blog"])


@router.get("", response_model=list[PostSummary], summary="Posts in this workspace")
def list_posts(
    ctx: WorkspaceCtx,
    db: DbSession,
    status_: Annotated[Literal["draft", "published"] | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    tag: Annotated[str | None, Query(max_length=40)] = None,
) -> list[PostSummary]:
    return service.list_posts(db, ctx.ws_id, status_, search, tag)


@router.post("", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(body: PostCreate, ctx: WorkspaceCtx, db: DbSession) -> PostRead:
    return service.post_read(db, service.create_post(db, ctx, body.title, body.category_id))


@router.get("/{post_id}", response_model=PostRead)
def get_post(post_id: int, ctx: WorkspaceCtx, db: DbSession) -> PostRead:
    return service.post_read(db, service.get_post(db, ctx, post_id))


@router.patch("/{post_id}", response_model=PostRead)
def update_post(post_id: int, body: PostUpdate, ctx: WorkspaceCtx, db: DbSession) -> PostRead:
    post = service.get_post(db, ctx, post_id, write=True)
    return service.post_read(
        db, service.update_post(db, ctx, post, body.model_dump(exclude_unset=True))
    )


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_post(db, service.get_post(db, ctx, post_id, write=True))


@router.get("/{post_id}/revisions", response_model=list[RevisionSummary])
def list_revisions(post_id: int, ctx: WorkspaceCtx, db: DbSession) -> list[RevisionSummary]:
    post = service.get_post(db, ctx, post_id)
    return [RevisionSummary(**r) for r in revisions.list_revisions(db, "post", post.id)]


@router.get("/{post_id}/revisions/{revision_id}", response_model=RevisionRead)
def get_revision(post_id: int, revision_id: int, ctx: WorkspaceCtx, db: DbSession) -> RevisionRead:
    post = service.get_post(db, ctx, post_id)
    return RevisionRead.model_validate(revisions.get_revision(db, "post", post.id, revision_id))


@router.post("/{post_id}/revisions/{revision_id}/restore", response_model=PostRead)
def restore_revision(post_id: int, revision_id: int, ctx: WorkspaceCtx, db: DbSession) -> PostRead:
    post = service.get_post(db, ctx, post_id, write=True)
    return service.post_read(db, service.restore_revision(db, post, revision_id))


@public.get("/{workspace_slug}", response_model=PublicBlog, summary="Published posts")
def public_blog(
    workspace_slug: str,
    db: DbSession,
    tag: Annotated[str | None, Query(max_length=40)] = None,
) -> PublicBlog:
    return service.public_blog(db, workspace_slug, tag)


@public.get("/{workspace_slug}/{post_slug}", response_model=PostRead, summary="One post")
def public_post(workspace_slug: str, post_slug: str, db: DbSession) -> PostRead:
    return service.public_post(db, workspace_slug, post_slug)
