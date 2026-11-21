"""
Version history for notes, documentation pages and blog posts.

Before an edit changes the text, the previous state is saved, at most once every
10 minutes per item, so history shows meaningful steps instead of every keystroke.
Restoring saves the current state first, so a restore can be undone.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Revision, User

INTERVAL = timedelta(minutes=10)
KEEP = 60


def _utc(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def snapshot(
    db: Session,
    kind: str,
    item_id: int,
    title: str,
    body: dict[str, Any] | None,
    content: str,
    user_id: int | None,
    *,
    force: bool = False,
) -> None:
    """Saves the given (previous) state. Does not commit."""
    if not force:
        last = db.scalar(
            select(Revision.created_at)
            .where(Revision.kind == kind, Revision.item_id == item_id)
            .order_by(Revision.id.desc())
            .limit(1)
        )
        if last is not None and datetime.now(UTC) - _utc(last) < INTERVAL:
            return
    if not content.strip() and not title.strip():
        return
    db.add(
        Revision(
            kind=kind,
            item_id=item_id,
            title=title[:200],
            body=body,
            content=content,
            user_id=user_id,
        )
    )
    db.flush()
    stale = db.scalars(
        select(Revision.id)
        .where(Revision.kind == kind, Revision.item_id == item_id)
        .order_by(Revision.id.desc())
        .offset(KEEP)
    ).all()
    if stale:
        db.execute(delete(Revision).where(Revision.id.in_(stale)))


def list_revisions(db: Session, kind: str, item_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Revision.id, Revision.title, Revision.content, Revision.created_at, User)
        .outerjoin(User, User.id == Revision.user_id)
        .where(Revision.kind == kind, Revision.item_id == item_id)
        .order_by(Revision.id.desc())
    ).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "chars": len(row.content),
            "excerpt": row.content[:160],
            "created_at": row.created_at,
            "user_name": (row.User.display_name or row.User.email) if row.User else "",
        }
        for row in rows
    ]


def get_revision(db: Session, kind: str, item_id: int, revision_id: int) -> Revision:
    row = db.get(Revision, revision_id)
    if row is None or row.kind != kind or row.item_id != item_id:
        raise NotFoundError("Version not found.", code="revision_not_found")
    return row


def delete_for(db: Session, kind: str, item_ids: list[int]) -> None:
    if item_ids:
        db.execute(delete(Revision).where(Revision.kind == kind, Revision.item_id.in_(item_ids)))
