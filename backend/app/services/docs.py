"""
Documentation spaces and their page tree.

Pages are ordered per parent with dense positions (0, 1, 2, ...) renumbered by the
server; clients send an index. A page can be moved under any page of the same space
except itself and its own descendants.
"""

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.ai.client import OllamaClient
from app.ai.retrieval import NoteText
from app.core.config import Settings
from app.core.errors import InvalidInputError, NotFoundError
from app.models import DocPage, DocSpace, Share, User
from app.schemas.content import (
    AskResponse,
    AskSource,
    DocPageCreate,
    DocPageNode,
    DocPageRead,
    DocSpaceCreate,
    DocSpaceRead,
    DocSpaceSummary,
    SearchHit,
)
from app.services import assistant, revisions
from app.services import categories as categories_service
from app.services.access import Ctx, check, item_role
from app.services.notes import escape_like

TEMPLATES: dict[str, dict[str, list[str]]] = {
    "blank": {"en": ["Introduction"], "fa": ["مقدمه"]},
    "guide": {
        "en": ["Introduction", "Getting started", "Installation", "Core concepts", "FAQ"],
        "fa": ["مقدمه", "شروع کار", "نصب و راه‌اندازی", "مفاهیم اصلی", "سؤالات متداول"],
    },
    "api": {
        "en": ["Overview", "Authentication", "Endpoints", "Errors", "Changelog"],
        "fa": ["نمای کلی", "احراز هویت", "مسیرها (Endpoints)", "خطاها", "تغییرات نسخه‌ها"],
    },
    "handbook": {
        "en": ["Welcome", "How we work", "Tools", "Processes", "Glossary"],
        "fa": ["خوش آمدید", "روش کار ما", "ابزارها", "فرایندها", "واژه‌نامه"],
    },
}


def _space_missing() -> NotFoundError:
    return NotFoundError("Documentation not found.", code="doc_not_found")


def _page_missing() -> NotFoundError:
    return NotFoundError("Page not found.", code="doc_page_not_found")


def get_space(db: Session, ctx: Ctx, space_id: int, *, write: bool = False) -> DocSpace:
    space = db.get(DocSpace, space_id)
    if space is None:
        raise _space_missing()
    check(db, ctx, "doc", space.workspace_id, space.id, write=write, missing=_space_missing())
    return space


def get_page(db: Session, space: DocSpace, page_id: int) -> DocPage:
    page = db.get(DocPage, page_id)
    if page is None or page.space_id != space.id:
        raise _page_missing()
    return page


def _page_counts(db: Session, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    rows = db.execute(
        select(DocPage.space_id, func.count())
        .where(DocPage.space_id.in_(ids))
        .group_by(DocPage.space_id)
    ).all()
    return {row[0]: row[1] for row in rows}


def list_spaces(db: Session, ws_id: int) -> list[DocSpaceSummary]:
    spaces = db.scalars(
        select(DocSpace)
        .where(DocSpace.workspace_id == ws_id)
        .order_by(DocSpace.starred.desc(), DocSpace.updated_at.desc())
    ).all()
    counts = _page_counts(db, [s.id for s in spaces])
    result = []
    for space in spaces:
        summary = DocSpaceSummary.model_validate(space)
        summary.page_count = counts.get(space.id, 0)
        result.append(summary)
    return result


def _pages(db: Session, space_id: int) -> list[DocPage]:
    return list(
        db.scalars(
            select(DocPage)
            .where(DocPage.space_id == space_id)
            .order_by(DocPage.parent_id.nulls_first(), DocPage.position, DocPage.id)
        )
    )


def space_read(db: Session, ctx: Ctx, space: DocSpace) -> DocSpaceRead:
    pages = [
        DocPageNode.model_validate(p)
        for p in db.scalars(
            select(DocPage)
            .where(DocPage.space_id == space.id)
            .order_by(DocPage.position, DocPage.id)
        )
    ]
    summary = DocSpaceSummary.model_validate(space)
    summary.page_count = len(pages)
    role = item_role(db, ctx, "doc", space.workspace_id, space.id) or "viewer"
    shared = (
        space.workspace_id != ctx.ws_id
        and db.scalar(
            select(Share.id).where(
                Share.kind == "doc", Share.item_id == space.id, Share.user_id == ctx.user_id
            )
        )
        is not None
    )
    return DocSpaceRead(**summary.model_dump(), pages=pages, role=role, shared=shared)


def page_read(db: Session, page: DocPage) -> DocPageRead:
    read = DocPageRead.model_validate(page)
    if page.updated_by:
        editor = db.get(User, page.updated_by)
        if editor is not None:
            read.updated_by_name = editor.display_name or editor.email
    return read


def _touch(space: DocSpace) -> None:
    space.updated_at = datetime.now(UTC)


def create_space(db: Session, ctx: Ctx, data: DocSpaceCreate) -> DocSpace:
    ctx.require_edit()
    categories_service.ensure_owned(db, ctx.ws_id, data.category_id)
    space = DocSpace(
        workspace_id=ctx.ws_id,
        user_id=ctx.user_id,
        title=data.title,
        description=data.description,
        icon=data.icon,
        color=data.color,
        category_id=data.category_id,
        tags=data.tags,
    )
    db.add(space)
    db.flush()
    language = ctx.user.language if ctx.user.language in ("en", "fa") else "en"
    for position, title in enumerate(TEMPLATES[data.template][language]):
        db.add(DocPage(space_id=space.id, title=title, position=position, updated_by=ctx.user_id))
    db.commit()
    db.refresh(space)
    return space


def update_space(db: Session, space: DocSpace, changes: dict[str, Any]) -> DocSpace:
    if "category_id" in changes:
        categories_service.ensure_owned(db, space.workspace_id, changes["category_id"])
    for key, value in changes.items():
        setattr(space, key, value)
    db.commit()
    db.refresh(space)
    return space


def delete_space(db: Session, space: DocSpace) -> None:
    page_ids = list(db.scalars(select(DocPage.id).where(DocPage.space_id == space.id)))
    revisions.delete_for(db, "doc_page", page_ids)
    db.execute(delete(Share).where(Share.kind == "doc", Share.item_id == space.id))
    db.delete(space)
    db.commit()


# ---------------------------------------------------------------- pages


def _siblings(
    db: Session, space_id: int, parent_id: int | None, exclude: int | None = None
) -> list[DocPage]:
    query = select(DocPage).where(DocPage.space_id == space_id)
    query = query.where(
        DocPage.parent_id.is_(None) if parent_id is None else DocPage.parent_id == parent_id
    )
    if exclude is not None:
        query = query.where(DocPage.id != exclude)
    return list(db.scalars(query.order_by(DocPage.position, DocPage.id)))


def _place(rows: list[DocPage], page: DocPage, index: int | None) -> None:
    index = len(rows) if index is None else max(0, min(index, len(rows)))
    rows.insert(index, page)
    for position, row in enumerate(rows):
        row.position = position


def _check_parent(db: Session, space: DocSpace, parent_id: int | None, page_id: int | None) -> None:
    if parent_id is None:
        return
    parent = db.get(DocPage, parent_id)
    if parent is None or parent.space_id != space.id:
        raise InvalidInputError("Parent page not found.", code="doc_page_not_found")
    # A page cannot become a child of itself or of one of its descendants.
    node: DocPage | None = parent
    while node is not None and page_id is not None:
        if node.id == page_id:
            raise InvalidInputError("A page cannot be moved inside itself.", code="doc_page_cycle")
        node = db.get(DocPage, node.parent_id) if node.parent_id else None


def create_page(db: Session, ctx: Ctx, space: DocSpace, data: DocPageCreate) -> DocPage:
    _check_parent(db, space, data.parent_id, None)
    rows = _siblings(db, space.id, data.parent_id)
    page = DocPage(
        space_id=space.id,
        parent_id=data.parent_id,
        title=data.title.strip(),
        icon=data.icon,
        body=data.body,
        content=data.content,
        updated_by=ctx.user_id,
    )
    _place(rows, page, data.index)
    db.add(page)
    _touch(space)
    db.commit()
    db.refresh(page)
    return page


def create_pages(
    db: Session, ctx: Ctx, space: DocSpace, parent_id: int | None, items: list[DocPageCreate]
) -> list[DocPage]:
    _check_parent(db, space, parent_id, None)
    rows = _siblings(db, space.id, parent_id)
    created = []
    for data in items:
        page = DocPage(
            space_id=space.id,
            parent_id=parent_id,
            title=data.title.strip(),
            icon=data.icon,
            body=data.body,
            content=data.content,
            updated_by=ctx.user_id,
        )
        _place(rows, page, None)
        db.add(page)
        created.append(page)
    _touch(space)
    db.commit()
    for page in created:
        db.refresh(page)
    return created


def update_page(
    db: Session, ctx: Ctx, space: DocSpace, page: DocPage, changes: dict[str, Any]
) -> DocPage:
    if "body" in changes or "content" in changes:
        revisions.snapshot(
            db, "doc_page", page.id, page.title, page.body, page.content, page.updated_by
        )
    for key, value in changes.items():
        setattr(page, key, value.strip() if key == "title" else value)
    page.updated_by = ctx.user_id
    _touch(space)
    db.commit()
    db.refresh(page)
    return page


def move_page(
    db: Session, space: DocSpace, page: DocPage, parent_id: int | None, index: int
) -> None:
    _check_parent(db, space, parent_id, page.id)
    old_parent = page.parent_id
    page.parent_id = parent_id
    rows = _siblings(db, space.id, parent_id, exclude=page.id)
    _place(rows, page, index)
    if old_parent != parent_id:
        for position, row in enumerate(_siblings(db, space.id, old_parent, exclude=page.id)):
            row.position = position
    _touch(space)
    db.commit()


def delete_page(db: Session, space: DocSpace, page: DocPage) -> None:
    children: dict[int | None, list[int]] = defaultdict(list)
    for row_id, parent in db.execute(
        select(DocPage.id, DocPage.parent_id).where(DocPage.space_id == space.id)
    ).all():
        children[parent].append(row_id)
    doomed, stack = [], [page.id]
    while stack:
        current = stack.pop()
        doomed.append(current)
        stack.extend(children.get(current, []))
    revisions.delete_for(db, "doc_page", doomed)
    parent_id = page.parent_id
    db.delete(page)
    db.flush()
    for position, row in enumerate(_siblings(db, space.id, parent_id)):
        row.position = position
    _touch(space)
    db.commit()


def duplicate_page(db: Session, ctx: Ctx, space: DocSpace, page: DocPage, suffix: str) -> DocPage:
    rows = _siblings(db, space.id, page.parent_id)
    copy = DocPage(
        space_id=space.id,
        parent_id=page.parent_id,
        title=f"{page.title} {suffix}".strip()[:200],
        icon=page.icon,
        body=page.body,
        content=page.content,
        updated_by=ctx.user_id,
    )
    _place(rows, copy, rows.index(page) + 1 if page in rows else None)
    db.add(copy)
    _touch(space)
    db.commit()
    db.refresh(copy)
    return copy


def restore_revision(
    db: Session, ctx: Ctx, space: DocSpace, page: DocPage, revision_id: int
) -> DocPage:
    revision = revisions.get_revision(db, "doc_page", page.id, revision_id)
    revisions.snapshot(
        db, "doc_page", page.id, page.title, page.body, page.content, page.updated_by, force=True
    )
    page.title, page.body, page.content = revision.title, revision.body, revision.content
    page.updated_by = ctx.user_id
    _touch(space)
    db.commit()
    db.refresh(page)
    return page


# ---------------------------------------------------------------- search and AI


def _snippet(content: str, term: str) -> str:
    at = content.lower().find(term.lower())
    if at < 0:
        return content[:160]
    start = max(at - 60, 0)
    return ("…" if start else "") + content[start : at + 100].replace("\n", " ")


def search(db: Session, space: DocSpace, query: str) -> list[SearchHit]:
    term = query.strip()
    if not term:
        return []
    pattern = f"%{escape_like(term)}%"
    rows = db.scalars(
        select(DocPage)
        .where(
            DocPage.space_id == space.id,
            or_(
                DocPage.title.ilike(pattern, escape="\\"),
                DocPage.content.ilike(pattern, escape="\\"),
            ),
        )
        .limit(30)
    ).all()
    rows = sorted(rows, key=lambda p: term.lower() not in p.title.lower())
    return [SearchHit(id=p.id, title=p.title, snippet=_snippet(p.content, term)) for p in rows]


async def ask(
    db: Session,
    ollama: OllamaClient,
    settings: Settings,
    space: DocSpace,
    question: str,
    thorough: bool,
) -> AskResponse:
    pages = _pages(db, space.id)
    texts = [NoteText(id=p.id, title=p.title, content=p.content) for p in pages]
    answer = await assistant.answer_chat(ollama, settings, texts, [], question, thorough)
    return AskResponse(
        answer=answer.content,
        sources=[
            AskSource(id=n.id, title=n.title, url=f"/docs/{space.id}/{n.id}")
            for n in answer.selection.notes
        ],
        cited_ids=answer.cited_note_ids,
        partial=answer.selection.partial,
        model=ollama.model,
    )
