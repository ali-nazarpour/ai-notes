"""Workspaces, members, invitations and sharing single items."""

import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ConflictError, ForbiddenError, InvalidInputError, NotFoundError
from app.core.security import hash_token, new_token
from app.models import (
    Board,
    Category,
    DocSpace,
    DriveItem,
    Note,
    Project,
    Share,
    SlideDeck,
    User,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)
from app.schemas.workspace import (
    InviteCreate,
    InviteCreated,
    InviteRead,
    MemberRead,
    ShareCreate,
    SharedItem,
    ShareRead,
    WorkspaceCreate,
    WorkspaceRead,
)
from app.services import mailer
from app.services.access import Ctx, at_least, check, member_role

INVITE_LIFETIME = timedelta(days=14)

DEFAULT_CATEGORIES: dict[str, tuple[tuple[str, str, str], ...]] = {
    "en": (
        ("English learning", "blue", "📚"),
        ("Daily shopping", "green", "🛒"),
        ("Today's tasks", "orange", "✅"),
    ),
    "fa": (
        ("یادگیری زبان انگلیسی", "blue", "📚"),
        ("خریدهای روزانه", "green", "🛒"),
        ("کارهای امروز", "orange", "✅"),
    ),
}
PERSONAL_NAME = {"en": "Personal", "fa": "فضای شخصی"}


def _not_found() -> NotFoundError:
    return NotFoundError("Workspace not found.", code="workspace_not_found")


def display(user: User) -> str:
    full = f"{user.first_name} {user.last_name}".strip()
    return user.display_name or full or user.email.split("@")[0]


# ---------------------------------------------------------------- workspaces


def _slug(db: Session, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "workspace"
    while True:
        slug = f"{base}-{secrets.token_hex(3)}"
        if db.scalar(select(Workspace.id).where(Workspace.slug == slug)) is None:
            return slug


def create_workspace(
    db: Session, user: User, data: WorkspaceCreate, *, seed_categories: bool = True
) -> Workspace:
    """Creates a workspace owned by ``user`` (flushes; the caller commits)."""
    workspace = Workspace(
        name=data.name,
        slug=_slug(db, data.name),
        icon=data.icon,
        description=data.description,
        accent_color=data.accent_color,
        theme=data.theme,
        owner_id=user.id,
        settings={},
    )
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
    if seed_categories:
        language = user.language if user.language in DEFAULT_CATEGORIES else "en"
        for name, color, icon in DEFAULT_CATEGORIES[language]:
            db.add(
                Category(
                    user_id=user.id, workspace_id=workspace.id, name=name, color=color, icon=icon
                )
            )
    db.flush()
    return workspace


def create_personal(db: Session, user: User) -> Workspace:
    name = PERSONAL_NAME.get(user.language, PERSONAL_NAME["en"])
    return create_workspace(db, user, WorkspaceCreate(name=name, icon="🏠"))


def default_workspace(db: Session, user: User) -> Workspace:
    """The workspace used when a request names none: the oldest one the user owns."""
    workspace = db.scalar(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by((Workspace.owner_id != user.id), Workspace.id)
        .limit(1)
    )
    if workspace is None:  # e.g. the user left every workspace
        workspace = create_personal(db, user)
        db.commit()
    return workspace


def context(db: Session, user: User, workspace_id: int | None) -> Ctx:
    if workspace_id is None:
        workspace = default_workspace(db, user)
        return Ctx(user, workspace, member_role(db, user.id, workspace.id) or "owner")
    role = member_role(db, user.id, workspace_id)
    found = db.get(Workspace, workspace_id) if role else None
    if found is None or role is None:
        raise _not_found()
    return Ctx(user, found, role)


def _member_counts(db: Session, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    rows = db.execute(
        select(WorkspaceMember.workspace_id, func.count())
        .where(WorkspaceMember.workspace_id.in_(ids))
        .group_by(WorkspaceMember.workspace_id)
    ).all()
    return {row[0]: row[1] for row in rows}


def to_read(workspace: Workspace, role: str, members: int) -> WorkspaceRead:
    read = WorkspaceRead.model_validate(workspace)
    read.role = role  # type: ignore[assignment]
    read.member_count = members
    return read


def list_workspaces(db: Session, user: User) -> list[WorkspaceRead]:
    rows = db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.id)
    ).all()
    counts = _member_counts(db, [row[0].id for row in rows])
    return [to_read(ws, role, counts.get(ws.id, 1)) for ws, role in rows]


def read(db: Session, ctx: Ctx) -> WorkspaceRead:
    return to_read(ctx.workspace, ctx.role, _member_counts(db, [ctx.ws_id]).get(ctx.ws_id, 1))


def update_workspace(db: Session, ctx: Ctx, changes: dict[str, Any]) -> Workspace:
    ctx.require_admin()
    return save_workspace(db, ctx.workspace, changes)


def save_workspace(db: Session, workspace: Workspace, changes: dict[str, Any]) -> Workspace:
    """Apply validated changes after the caller has checked access."""
    if "settings" in changes:
        merged = dict(workspace.settings or {})
        merged.update(changes.pop("settings"))
        workspace.settings = merged
    for key, value in changes.items():
        setattr(workspace, key, value)
    db.commit()
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, ctx: Ctx) -> None:
    if ctx.role != "owner":
        raise ForbiddenError("Only the owner can delete a workspace.", code="workspace_owner_only")
    remove_workspace(db, ctx.workspace)


def remove_workspace(db: Session, workspace: Workspace, *, replace_last: bool = False) -> None:
    """Remove a workspace after authorization, keeping an owned workspace available."""
    owner = db.get(User, workspace.owner_id, with_for_update=True)
    target = db.get(Workspace, workspace.id, with_for_update=True, populate_existing=True)
    if owner is None or target is None:
        raise _not_found()
    owned = db.scalar(
        select(func.count()).select_from(Workspace).where(Workspace.owner_id == owner.id)
    )
    if (owned or 0) <= 1:
        if not replace_last:
            raise InvalidInputError("You cannot delete your only workspace.", code="last_workspace")
        create_personal(db, owner)
    db.delete(target)
    db.commit()


# ---------------------------------------------------------------- members


def list_members(db: Session, ctx: Ctx) -> list[MemberRead]:
    rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == ctx.ws_id)
        .order_by(WorkspaceMember.id)
    ).all()
    return [
        MemberRead(
            id=m.id,
            user_id=u.id,
            email=u.email,
            name=display(u),
            avatar=u.avatar,
            role=m.role,
            joined_at=m.created_at,
        )
        for m, u in rows
    ]


def _member(db: Session, ctx: Ctx, member_id: int) -> WorkspaceMember:
    member = db.get(WorkspaceMember, member_id)
    if member is None or member.workspace_id != ctx.ws_id:
        raise NotFoundError("Member not found.", code="member_not_found")
    return member


def update_member(db: Session, ctx: Ctx, member_id: int, role: str) -> None:
    ctx.require_admin()
    member = _member(db, ctx, member_id)
    if member.role == "owner":
        raise ForbiddenError("The owner's role cannot be changed.", code="owner_role_fixed")
    if role == "admin" and ctx.role != "owner":
        raise ForbiddenError("Only the owner can add admins.", code="workspace_owner_only")
    member.role = role
    db.commit()


def remove_member(db: Session, ctx: Ctx, member_id: int) -> None:
    member = _member(db, ctx, member_id)
    if member.user_id != ctx.user_id:
        ctx.require_admin()
        if member.role == "admin" and ctx.role != "owner":
            raise ForbiddenError("Only the owner can remove admins.", code="workspace_owner_only")
    if member.role == "owner":
        raise ForbiddenError("The owner cannot leave the workspace.", code="owner_cannot_leave")
    db.delete(member)
    db.commit()


# ---------------------------------------------------------------- invitations


def _invite_read(db: Session, invite: WorkspaceInvite) -> InviteRead:
    workspace = db.get(Workspace, invite.workspace_id)
    inviter = db.get(User, invite.invited_by) if invite.invited_by else None
    return InviteRead(
        id=invite.id,
        workspace_id=invite.workspace_id,
        workspace_name=workspace.name if workspace else "",
        workspace_icon=workspace.icon if workspace else "",
        email=invite.email,
        role=invite.role,
        invited_by=display(inviter) if inviter else "",
        created_at=invite.created_at,
        expires_at=invite.expires_at,
    )


def _is_open(invite: WorkspaceInvite) -> bool:
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return invite.accepted_at is None and expires > datetime.now(UTC)


def create_invite(db: Session, settings: Settings, ctx: Ctx, data: InviteCreate) -> InviteCreated:
    ctx.require_admin()
    if data.role == "admin" and ctx.role != "owner":
        raise ForbiddenError("Only the owner can invite admins.", code="workspace_owner_only")
    existing_user = db.scalar(select(User).where(User.email == data.email))
    if existing_user and member_role(db, existing_user.id, ctx.ws_id):
        raise ConflictError("This person is already a member.", code="already_member")

    token = new_token()
    invite = db.scalar(
        select(WorkspaceInvite).where(
            WorkspaceInvite.workspace_id == ctx.ws_id,
            WorkspaceInvite.email == data.email,
            WorkspaceInvite.accepted_at.is_(None),
        )
    )
    if invite is None:
        invite = WorkspaceInvite(
            workspace_id=ctx.ws_id,
            email=data.email,
            role=data.role,
            token_hash="",
            expires_at=datetime.now(UTC),
        )
        db.add(invite)
    invite.role = data.role
    invite.token_hash = hash_token(token)
    invite.invited_by = ctx.user_id
    invite.expires_at = datetime.now(UTC) + INVITE_LIFETIME
    db.commit()
    db.refresh(invite)

    app = mailer.general(db, settings)
    link = f"{app.app_url}/invite/{token}"
    rtl = (existing_user.language if existing_user else ctx.user.language) == "fa"
    name = display(ctx.user)
    workspace = ctx.workspace
    paragraphs = (
        [f"{name} شما را به فضای کاری «{workspace.name}» در {app.app_name} دعوت کرده است."]
        if rtl
        else [f"{name} invited you to the workspace “{workspace.name}” on {app.app_name}."]
    )
    if data.message:
        paragraphs.append(data.message)
    paragraphs.append(
        "اگر حساب ندارید، با همین ایمیل ثبت‌نام کنید."
        if rtl
        else "If you do not have an account yet, sign up with this email address."
    )
    status = mailer.send(
        db,
        settings,
        mailer.Mail(
            to=data.email,
            subject=(f"دعوت به {workspace.name}" if rtl else f"Invitation to {workspace.name}"),
            kind="invite",
            heading=("دعوت به فضای کاری" if rtl else "You're invited"),
            paragraphs=paragraphs,
            button=(("پذیرفتن دعوت" if rtl else "Accept invitation"), link),
            footer=(
                "این دعوت ۱۴ روز اعتبار دارد." if rtl else "This invitation expires in 14 days."
            ),
            rtl=rtl,
        ),
    )
    base = _invite_read(db, invite)
    return InviteCreated(**base.model_dump(), link=link, email_status=status)


def list_invites(db: Session, ctx: Ctx) -> list[InviteRead]:
    ctx.require_admin()
    rows = db.scalars(
        select(WorkspaceInvite)
        .where(WorkspaceInvite.workspace_id == ctx.ws_id, WorkspaceInvite.accepted_at.is_(None))
        .order_by(WorkspaceInvite.id.desc())
    ).all()
    return [_invite_read(db, row) for row in rows if _is_open(row)]


def revoke_invite(db: Session, ctx: Ctx, invite_id: int) -> None:
    ctx.require_admin()
    invite = db.get(WorkspaceInvite, invite_id)
    if invite is None or invite.workspace_id != ctx.ws_id:
        raise NotFoundError("Invitation not found.", code="invite_not_found")
    db.delete(invite)
    db.commit()


def my_invites(db: Session, user: User) -> list[InviteRead]:
    rows = db.scalars(
        select(WorkspaceInvite)
        .where(WorkspaceInvite.email == user.email, WorkspaceInvite.accepted_at.is_(None))
        .order_by(WorkspaceInvite.id.desc())
    ).all()
    return [_invite_read(db, row) for row in rows if _is_open(row)]


def _accept(db: Session, user: User, invite: WorkspaceInvite | None) -> Workspace:
    if invite is None or not _is_open(invite):
        raise NotFoundError("This invitation is invalid or has expired.", code="invite_not_found")
    if invite.email != user.email:
        raise ForbiddenError(
            "This invitation was sent to a different email address.", code="invite_other_email"
        )
    if member_role(db, user.id, invite.workspace_id) is None:
        db.add(WorkspaceMember(workspace_id=invite.workspace_id, user_id=user.id, role=invite.role))
    invite.accepted_at = datetime.now(UTC)
    db.commit()
    workspace = db.get(Workspace, invite.workspace_id)
    assert workspace is not None
    return workspace


def accept_by_token(db: Session, user: User, token: str) -> Workspace:
    invite = db.scalar(
        select(WorkspaceInvite).where(WorkspaceInvite.token_hash == hash_token(token))
    )
    return _accept(db, user, invite)


def accept_by_id(db: Session, user: User, invite_id: int) -> Workspace:
    return _accept(db, user, db.get(WorkspaceInvite, invite_id))


def decline(db: Session, user: User, invite_id: int) -> None:
    invite = db.get(WorkspaceInvite, invite_id)
    if invite is None or invite.email != user.email:
        raise NotFoundError("Invitation not found.", code="invite_not_found")
    db.delete(invite)
    db.commit()


def invite_preview(db: Session, token: str) -> InviteRead:
    invite = db.scalar(
        select(WorkspaceInvite).where(WorkspaceInvite.token_hash == hash_token(token))
    )
    if invite is None or not _is_open(invite):
        raise NotFoundError("This invitation is invalid or has expired.", code="invite_not_found")
    return _invite_read(db, invite)


def valid_invite_for(db: Session, token: str, email: str) -> bool:
    invite = db.scalar(
        select(WorkspaceInvite).where(WorkspaceInvite.token_hash == hash_token(token))
    )
    return invite is not None and _is_open(invite) and invite.email == email


# ---------------------------------------------------------------- sharing single items

_MODELS: dict[str, Any] = {
    "note": Note,
    "board": Board,
    "doc": DocSpace,
    "project": Project,
    "drive": DriveItem,
    "deck": SlideDeck,
}
_URLS = {
    "note": "/notes/{}",
    "board": "/boards/{}",
    "doc": "/docs/{}",
    "project": "/projects/{}",
    "drive": "/drive/item/{}",
    "deck": "/slides/{}",
}


def _item(db: Session, kind: str, item_id: int) -> tuple[Any, str, int | None]:
    model = _MODELS[kind]
    row = db.get(model, item_id)
    if row is None:
        return None, "", None
    title = getattr(row, "title", None) or getattr(row, "name", "")
    return row, str(title or ""), row.workspace_id


def _missing() -> NotFoundError:
    return NotFoundError("Item not found.", code="item_not_found")


def _share_read(share: Share, user: User) -> ShareRead:
    return ShareRead(
        id=share.id,
        kind=share.kind,
        item_id=share.item_id,
        user_id=user.id,
        email=user.email,
        name=display(user),
        avatar=user.avatar,
        role=share.role,
        created_at=share.created_at,
    )


def list_shares(db: Session, ctx: Ctx, kind: str, item_id: int) -> list[ShareRead]:
    _row, _title, ws_id = _item(db, kind, item_id)
    check(db, ctx, kind, ws_id, item_id, write=False, missing=_missing())
    rows = db.execute(
        select(Share, User)
        .join(User, User.id == Share.user_id)
        .where(Share.kind == kind, Share.item_id == item_id)
        .order_by(Share.id)
    ).all()
    return [_share_read(share, user) for share, user in rows]


def create_share(db: Session, settings: Settings, ctx: Ctx, data: ShareCreate) -> ShareRead:
    _row, title, ws_id = _item(db, data.kind, data.item_id)
    check(db, ctx, data.kind, ws_id, data.item_id, write=True, missing=_missing())
    assert ws_id is not None
    target = db.scalar(select(User).where(User.email == data.email))
    if target is None or not target.is_active:
        raise NotFoundError("Nobody has signed up with this email address.", code="user_not_found")
    if target.id == ctx.user_id:
        raise InvalidInputError("You already have access.", code="share_self")
    if member_role(db, target.id, ws_id):
        raise ConflictError(
            "This person is a member of the workspace and already has access.",
            code="already_member",
        )
    share = db.scalar(
        select(Share).where(
            Share.kind == data.kind, Share.item_id == data.item_id, Share.user_id == target.id
        )
    )
    created = share is None
    if share is None:
        share = Share(
            workspace_id=ws_id,
            kind=data.kind,
            item_id=data.item_id,
            user_id=target.id,
            role=data.role,
        )
        db.add(share)
    share.role = data.role
    share.shared_by = ctx.user_id
    db.commit()
    db.refresh(share)

    if created and target.email_notifications:
        app = mailer.general(db, settings)
        rtl = target.language == "fa"
        link = f"{app.app_url}{_URLS[data.kind].format(data.item_id)}"
        mailer.send(
            db,
            settings,
            mailer.Mail(
                to=target.email,
                subject=(
                    f"«{title}» با شما به اشتراک گذاشته شد"
                    if rtl
                    else f"“{title}” was shared with you"
                ),
                kind="share",
                heading=("یک مورد با شما به اشتراک گذاشته شد" if rtl else "Shared with you"),
                paragraphs=[
                    f"{display(ctx.user)} «{title}» را با شما به اشتراک گذاشت."
                    if rtl
                    else f"{display(ctx.user)} shared “{title}” with you."
                ],
                button=(("باز کردن" if rtl else "Open"), link),
                rtl=rtl,
            ),
        )
    return _share_read(share, target)


def _share(db: Session, share_id: int) -> Share:
    share = db.get(Share, share_id)
    if share is None:
        raise NotFoundError("Share not found.", code="share_not_found")
    return share


def update_share(db: Session, ctx: Ctx, share_id: int, role: str) -> None:
    share = _share(db, share_id)
    _row, _title, ws_id = _item(db, share.kind, share.item_id)
    check(db, ctx, share.kind, ws_id, share.item_id, write=True, missing=_missing())
    share.role = role
    db.commit()


def delete_share(db: Session, ctx: Ctx, share_id: int) -> None:
    """The person who has access can remove themselves; editors can remove anyone."""
    share = _share(db, share_id)
    if share.user_id != ctx.user_id:
        _row, _title, ws_id = _item(db, share.kind, share.item_id)
        role = member_role(db, ctx.user_id, ws_id) if ws_id else None
        if role is None or not at_least(role, "editor"):
            raise NotFoundError("Share not found.", code="share_not_found")
    db.delete(share)
    db.commit()


def shared_with_me(db: Session, user: User) -> list[SharedItem]:
    rows = db.scalars(select(Share).where(Share.user_id == user.id).order_by(Share.id.desc())).all()
    items: list[SharedItem] = []
    for share in rows:
        row, title, ws_id = _item(db, share.kind, share.item_id)
        if row is None or ws_id is None:
            continue
        workspace = db.get(Workspace, ws_id)
        sharer = db.get(User, share.shared_by) if share.shared_by else None
        items.append(
            SharedItem(
                share_id=share.id,
                kind=share.kind,
                item_id=share.item_id,
                title=title,
                role=share.role,
                workspace_id=ws_id,
                workspace_name=workspace.name if workspace else "",
                shared_by=display(sharer) if sharer else "",
                url=_URLS[share.kind].format(share.item_id),
                created_at=share.created_at,
            )
        )
    return items
