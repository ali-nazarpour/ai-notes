"""
Blog posts. A post is a draft or published; a published post with a future
``published_at`` is scheduled and appears on the public page only from that moment.
The public blog of a workspace is off until an admin turns it on in workspace settings.
"""

import math
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import BlogPost, User, Workspace
from app.schemas.content import PostRead, PostSummary, PublicBlog
from app.services import categories as categories_service
from app.services import revisions
from app.services.access import Ctx
from app.services.notes import escape_like

_NON_SLUG = re.compile(r"[^a-z0-9؀-ۿ]+")


def slugify(text: str) -> str:
    return _NON_SLUG.sub("-", text.lower()).strip("-")[:100] or "post"


def _unique_slug(db: Session, ws_id: int, base: str, exclude: int | None = None) -> str:
    slug, n = base, 2
    while True:
        query = select(BlogPost.id).where(BlogPost.workspace_id == ws_id, BlogPost.slug == slug)
        if exclude is not None:
            query = query.where(BlogPost.id != exclude)
        if db.scalar(query) is None:
            return slug
        slug = f"{base[:100]}-{n}"
        n += 1


def _missing() -> NotFoundError:
    return NotFoundError("Post not found.", code="post_not_found")


def get_post(db: Session, ctx: Ctx, post_id: int, *, write: bool = False) -> BlogPost:
    post = db.get(BlogPost, post_id)
    if post is None or post.workspace_id != ctx.ws_id:
        raise _missing()
    if write:
        ctx.require_edit()
    return post


def _minutes(content: str) -> int:
    return max(1, math.ceil(len(content.split()) / 200))


def _authors(db: Session, ids: set[int]) -> dict[int, User]:
    if not ids:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))}


def _summary(
    post: BlogPost, authors: dict[int, User], model: type[PostSummary] = PostSummary
) -> Any:
    read = model.model_validate(post)
    read.reading_minutes = _minutes(post.content)
    author = authors.get(post.user_id or 0)
    if author is not None:
        read.author_name = author.display_name or f"{author.first_name} {author.last_name}".strip()
        read.author_avatar = author.avatar
    return read


def list_posts(
    db: Session,
    ws_id: int,
    status: str | None = None,
    search: str | None = None,
    tag: str | None = None,
) -> list[PostSummary]:
    query = select(BlogPost).where(BlogPost.workspace_id == ws_id)
    if status:
        query = query.where(BlogPost.status == status)
    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        query = query.where(
            or_(
                BlogPost.title.ilike(pattern, escape="\\"),
                BlogPost.content.ilike(pattern, escape="\\"),
            )
        )
    posts = db.scalars(query.order_by(BlogPost.updated_at.desc())).all()
    if tag:
        posts = [p for p in posts if tag in (p.tags or [])]
    authors = _authors(db, {p.user_id for p in posts if p.user_id})
    return [_summary(p, authors) for p in posts]


def post_read(db: Session, post: BlogPost) -> PostRead:
    authors = _authors(db, {post.user_id} if post.user_id else set())
    result: PostRead = _summary(post, authors, PostRead)
    return result


def create_post(db: Session, ctx: Ctx, title: str, category_id: int | None) -> BlogPost:
    ctx.require_edit()
    categories_service.ensure_owned(db, ctx.ws_id, category_id)
    title = title.strip()
    post = BlogPost(
        workspace_id=ctx.ws_id,
        user_id=ctx.user_id,
        title=title,
        slug=_unique_slug(
            db, ctx.ws_id, slugify(title) if title else f"post-{int(datetime.now(UTC).timestamp())}"
        ),
        category_id=category_id,
        tags=[],
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def update_post(db: Session, ctx: Ctx, post: BlogPost, changes: dict[str, Any]) -> BlogPost:
    if "category_id" in changes:
        categories_service.ensure_owned(db, post.workspace_id, changes["category_id"])
    if "slug" in changes:
        wanted = changes["slug"]
        if _unique_slug(db, post.workspace_id, wanted, exclude=post.id) != wanted:
            raise ConflictError("Another post already uses this address.", code="slug_taken")
    if changes.get("status") == "published" and post.published_at is None:
        changes.setdefault("published_at", datetime.now(UTC))
    if (
        changes.get("published_at") is None
        and "published_at" in changes
        and (changes.get("status", post.status) == "published")
    ):
        changes["published_at"] = datetime.now(UTC)
    if "body" in changes or "content" in changes:
        revisions.snapshot(db, "post", post.id, post.title, post.body, post.content, post.user_id)
    for key, value in changes.items():
        setattr(post, key, value)
    db.commit()
    db.refresh(post)
    return post


def restore_revision(db: Session, post: BlogPost, revision_id: int) -> BlogPost:
    revision = revisions.get_revision(db, "post", post.id, revision_id)
    revisions.snapshot(
        db, "post", post.id, post.title, post.body, post.content, post.user_id, force=True
    )
    post.title, post.body, post.content = revision.title, revision.body, revision.content
    db.commit()
    db.refresh(post)
    return post


def delete_post(db: Session, post: BlogPost) -> None:
    revisions.delete_for(db, "post", [post.id])
    db.delete(post)
    db.commit()


# ---------------------------------------------------------------- public pages


def _public_workspace(db: Session, slug: str) -> Workspace:
    workspace = db.scalar(select(Workspace).where(Workspace.slug == slug))
    if workspace is None or not (workspace.settings or {}).get("blog_public"):
        raise NotFoundError("Blog not found.", code="blog_not_found")
    return workspace


def _visible(query: Any) -> Any:
    return query.where(BlogPost.status == "published", BlogPost.published_at <= datetime.now(UTC))


def public_blog(db: Session, slug: str, tag: str | None = None) -> PublicBlog:
    workspace = _public_workspace(db, slug)
    posts = db.scalars(
        _visible(select(BlogPost).where(BlogPost.workspace_id == workspace.id)).order_by(
            BlogPost.featured.desc(), BlogPost.published_at.desc()
        )
    ).all()
    if tag:
        posts = [p for p in posts if tag in (p.tags or [])]
    authors = _authors(db, {p.user_id for p in posts if p.user_id})
    return PublicBlog(
        workspace_name=workspace.name,
        workspace_icon=workspace.icon,
        description=workspace.description,
        posts=[_summary(p, authors) for p in posts],
    )


def public_post(db: Session, slug: str, post_slug: str) -> PostRead:
    workspace = _public_workspace(db, slug)
    post = db.scalar(
        _visible(
            select(BlogPost).where(
                BlogPost.workspace_id == workspace.id, BlogPost.slug == post_slug
            )
        )
    )
    if post is None:
        raise _missing()
    db.execute(
        update(BlogPost)
        .where(BlogPost.id == post.id)
        .values(views=BlogPost.views + 1, updated_at=BlogPost.updated_at)
    )
    db.commit()
    db.refresh(post)
    return post_read(db, post)
