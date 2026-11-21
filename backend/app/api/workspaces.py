"""Workspace, member, invitation and sharing routes."""

from fastapi import APIRouter, status

from app.api.deps import AppSettings, CurrentUser, DbSession, WorkspaceCtx
from app.schemas.workspace import (
    InviteAccept,
    InviteCreate,
    InviteCreated,
    InviteRead,
    MemberRead,
    MemberUpdate,
    ShareCreate,
    SharedItem,
    ShareKind,
    ShareRead,
    ShareUpdate,
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceUpdate,
)
from app.services import workspaces as service

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])
invites = APIRouter(prefix="/api/invites", tags=["workspaces"])
shares = APIRouter(prefix="/api/shares", tags=["sharing"])


@router.get("", response_model=list[WorkspaceRead], summary="Workspaces you belong to")
def list_workspaces(user: CurrentUser, db: DbSession) -> list[WorkspaceRead]:
    return service.list_workspaces(db, user)


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
def create_workspace(body: WorkspaceCreate, user: CurrentUser, db: DbSession) -> WorkspaceRead:
    workspace = service.create_workspace(db, user, body)
    db.commit()
    db.refresh(workspace)
    return service.to_read(workspace, "owner", 1)


@router.get("/current", response_model=WorkspaceRead, summary="The workspace of this request")
def current(ctx: WorkspaceCtx, db: DbSession) -> WorkspaceRead:
    return service.read(db, ctx)


@router.patch("/current", response_model=WorkspaceRead, summary="Rename, theme, settings")
def update_current(body: WorkspaceUpdate, ctx: WorkspaceCtx, db: DbSession) -> WorkspaceRead:
    changes = body.model_dump(exclude_unset=True)
    service.update_workspace(db, ctx, changes)
    return service.read(db, ctx)


@router.delete("/current", status_code=status.HTTP_204_NO_CONTENT, summary="Delete (owner)")
def delete_current(ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_workspace(db, ctx)


@router.get("/current/members", response_model=list[MemberRead])
def members(ctx: WorkspaceCtx, db: DbSession) -> list[MemberRead]:
    return service.list_members(db, ctx)


@router.patch("/current/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_member(member_id: int, body: MemberUpdate, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.update_member(db, ctx, member_id, body.role)


@router.delete(
    "/current/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member (or leave, with your own member id)",
)
def remove_member(member_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.remove_member(db, ctx, member_id)


@router.get("/current/invites", response_model=list[InviteRead], summary="Pending invitations")
def pending(ctx: WorkspaceCtx, db: DbSession) -> list[InviteRead]:
    return service.list_invites(db, ctx)


@router.post(
    "/current/invites",
    response_model=InviteCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Invite by email (the link is also returned, to share it another way)",
)
def invite(
    body: InviteCreate, ctx: WorkspaceCtx, db: DbSession, settings: AppSettings
) -> InviteCreated:
    return service.create_invite(db, settings, ctx, body)


@router.delete("/current/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(invite_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.revoke_invite(db, ctx, invite_id)


# --- Invitations addressed to me ---


@invites.get("", response_model=list[InviteRead], summary="Invitations sent to my email")
def my_invites(user: CurrentUser, db: DbSession) -> list[InviteRead]:
    return service.my_invites(db, user)


@invites.get("/preview/{token}", response_model=InviteRead, summary="Who invited me (no sign-in)")
def preview(token: str, db: DbSession) -> InviteRead:
    return service.invite_preview(db, token)


@invites.post("/accept", response_model=WorkspaceRead, summary="Accept with the emailed link")
def accept(body: InviteAccept, user: CurrentUser, db: DbSession) -> WorkspaceRead:
    workspace = service.accept_by_token(db, user, body.token)
    return service.to_read(workspace, service.member_role(db, user.id, workspace.id) or "viewer", 1)


@invites.post("/{invite_id}/accept", response_model=WorkspaceRead)
def accept_by_id(invite_id: int, user: CurrentUser, db: DbSession) -> WorkspaceRead:
    workspace = service.accept_by_id(db, user, invite_id)
    return service.to_read(workspace, service.member_role(db, user.id, workspace.id) or "viewer", 1)


@invites.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Decline")
def decline(invite_id: int, user: CurrentUser, db: DbSession) -> None:
    service.decline(db, user, invite_id)


# --- Sharing single items ---


@shares.get("", response_model=list[ShareRead], summary="Who an item is shared with")
def list_shares(kind: ShareKind, item_id: int, ctx: WorkspaceCtx, db: DbSession) -> list[ShareRead]:
    return service.list_shares(db, ctx, kind, item_id)


@shares.post("", response_model=ShareRead, status_code=status.HTTP_201_CREATED)
def share(body: ShareCreate, ctx: WorkspaceCtx, db: DbSession, settings: AppSettings) -> ShareRead:
    return service.create_share(db, settings, ctx, body)


@shares.get("/with-me", response_model=list[SharedItem], summary="Items shared with me")
def with_me(user: CurrentUser, db: DbSession) -> list[SharedItem]:
    return service.shared_with_me(db, user)


@shares.patch("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_share(share_id: int, body: ShareUpdate, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.update_share(db, ctx, share_id, body.role)


@shares.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def unshare(share_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_share(db, ctx, share_id)
