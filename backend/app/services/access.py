"""
Who may read or change what.

A request runs in one workspace (the ``X-Workspace-Id`` header, or the user's default
workspace). Lists show that workspace's content. Opening a single item is allowed when
the user is a member of the item's workspace or the item was shared with them, so a
shared note opens from any workspace. Viewers can read but not change anything.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ForbiddenError
from app.models import Share, User, Workspace, WorkspaceMember

SHARE_KINDS = ("note", "board", "doc", "project", "drive", "deck")
_RANK = {"viewer": 0, "editor": 1, "admin": 2, "owner": 3}


def read_only() -> ForbiddenError:
    return ForbiddenError("You can view this, but not change it.", code="read_only")


@dataclass
class Ctx:
    user: User
    workspace: Workspace
    role: str

    @property
    def user_id(self) -> int:
        return self.user.id

    @property
    def ws_id(self) -> int:
        return self.workspace.id

    @property
    def can_edit(self) -> bool:
        return self.role != "viewer"

    @property
    def is_admin(self) -> bool:
        return self.role in ("owner", "admin")

    def require_edit(self) -> None:
        if not self.can_edit:
            raise read_only()

    def require_admin(self) -> None:
        if not self.is_admin:
            raise ForbiddenError(
                "Only workspace owners and admins can do this.", code="workspace_admin_only"
            )


def at_least(role: str, needed: str) -> bool:
    return _RANK.get(role, -1) >= _RANK[needed]


def member_role(db: Session, user_id: int, workspace_id: int) -> str | None:
    return db.scalar(
        select(WorkspaceMember.role).where(
            WorkspaceMember.user_id == user_id, WorkspaceMember.workspace_id == workspace_id
        )
    )


def item_role(
    db: Session, ctx: Ctx, kind: str | None, workspace_id: int | None, item_id: int
) -> str | None:
    """The user's role for one item, or None when they cannot see it."""
    if workspace_id is None:
        return None
    if workspace_id == ctx.ws_id:
        return ctx.role
    role = member_role(db, ctx.user_id, workspace_id)
    if role is not None or kind is None:
        return role
    return db.scalar(
        select(Share.role).where(
            Share.kind == kind, Share.item_id == item_id, Share.user_id == ctx.user_id
        )
    )


def check(
    db: Session,
    ctx: Ctx,
    kind: str | None,
    workspace_id: int | None,
    item_id: int,
    *,
    write: bool,
    missing: AppError,
) -> str:
    """Returns the role, or raises ``missing`` (404) / read_only (403)."""
    role = item_role(db, ctx, kind, workspace_id, item_id)
    if role is None:
        raise missing
    if write and role == "viewer":
        raise read_only()
    return role
