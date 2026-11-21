"""
Admin panel: users, app-wide settings (email service, sign-up) and the email log.

Only accounts with ``is_admin`` can call these routes. Admins cannot lock themselves out:
they cannot disable, demote or delete their own account here, and at least one active
admin always remains.
"""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import Select

from app.api.deps import AdminUser, AppSettings, DbSession, Ollama, Storage
from app.core.errors import ConflictError, ForbiddenError, InvalidInputError, NotFoundError
from app.models import (
    AuthToken,
    BlogPost,
    Board,
    DocPage,
    DriveItem,
    EmailLog,
    LangCard,
    Note,
    PasswordReset,
    Project,
    SlideDeck,
    StoredFile,
    Task,
    User,
    Workspace,
    WorkspaceMember,
)
from app.schemas.auth import (
    AuthResponse,
    Language,
    LoginRequest,
    SessionRead,
    UserRead,
    _check_email,
)
from app.schemas.v5 import DriveSettings
from app.schemas.workspace import WorkspaceCreate, WorkspaceSettings, WorkspaceUpdate
from app.services import auth as auth_service
from app.services import drive as drive_service
from app.services import mailer
from app.services import workspaces as workspace_service
from app.services.notes import escape_like
from app.services.workspaces import display

router = APIRouter(prefix="/api/admin", tags=["admin"])


class Stats(BaseModel):
    users: int
    active_users_7d: int
    admins: int
    disabled: int
    workspaces: int
    notes: int
    tasks: int
    boards: int
    doc_pages: int
    posts: int
    projects: int
    files: int
    storage_bytes: int
    drive_files: int = 0
    drive_bytes: int = 0
    decks: int = 0
    flashcards: int = 0
    emails_sent: int
    emails_failed: int
    email_enabled: bool
    ai_reachable: bool
    ai_model: str
    ai_model_available: bool


class AdminUserRead(BaseModel):
    id: int
    email: str
    name: str
    avatar: str | None
    language: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    last_active: datetime | None
    workspaces: int
    notes: int
    storage_bytes: int


class AdminUserUpdate(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None
    email: str | None = Field(default=None, max_length=254)
    display_name: str | None = Field(default=None, max_length=80)
    language: Language | None = None

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str | None) -> str | None:
        return _check_email(value) if value is not None else None


class AdminUserCreate(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=80)
    language: Language = "en"
    is_admin: bool = False

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        return _check_email(value)


class AdminUserDirectory(BaseModel):
    items: list[AdminUserRead]
    total: int
    all_users: int
    admins: int
    disabled: int


class AdminMembership(BaseModel):
    id: int
    name: str
    role: str


class AdminUserDetails(AdminUserRead):
    display_name: str
    sessions: list[SessionRead]
    memberships: list[AdminMembership]


class AdminWorkspace(BaseModel):
    id: int
    name: str
    slug: str
    owner_id: int
    owner_name: str
    owner_email: str
    member_count: int
    created_at: datetime


class AdminWorkspaceDirectory(BaseModel):
    items: list[AdminWorkspace]
    total: int
    all_workspaces: int
    solo: int
    team: int


class AdminWorkspaceCreate(WorkspaceCreate):
    owner_email: str = Field(max_length=254)

    @field_validator("owner_email")
    @classmethod
    def check_owner_email(cls, value: str) -> str:
        return _check_email(value)


class AdminWorkspaceDetails(AdminWorkspace):
    icon: str
    description: str
    settings: WorkspaceSettings
    only_owned_workspace: bool


class SmtpSettings(BaseModel):
    enabled: bool = False
    host: str = Field(default="", max_length=200)
    port: int = Field(default=587, ge=1, le=65535)
    security: Literal["starttls", "ssl", "none"] = "starttls"
    username: str = Field(default="", max_length=254)
    from_email: str = Field(default="", max_length=254)
    from_name: str = Field(default="", max_length=100)


class SmtpRead(SmtpSettings):
    password_set: bool


class SmtpWrite(SmtpSettings):
    # None keeps the stored password, "" removes it.
    password: str | None = Field(default=None, max_length=300)

    @field_validator("from_email")
    @classmethod
    def check_from(cls, value: str) -> str:
        return _check_email(value) if value.strip() else ""


class GeneralRead(BaseModel):
    app_name: str = Field(default="AI Notes", min_length=1, max_length=60)
    app_url: str = Field(default="", max_length=200, pattern=r"^(https?://[^\s]+)?$")
    allow_registration: bool = True


class TestEmail(BaseModel):
    to: str = Field(max_length=254)

    @field_validator("to")
    @classmethod
    def check_to(cls, value: str) -> str:
        return _check_email(value)


class TestResult(BaseModel):
    status: Literal["sent", "failed", "skipped"]
    error: str


class EmailLogRead(BaseModel):
    id: int
    to_email: str
    subject: str
    kind: str
    status: str
    error: str
    created_at: datetime


class ResetLink(BaseModel):
    link: str
    email_status: Literal["sent", "failed", "skipped"]


def _count(db: DbSession, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


@router.post("/auth/login", response_model=AuthResponse)
def admin_login(body: LoginRequest, db: DbSession, request: Request) -> AuthResponse:
    user, token = auth_service.login(
        db, body.email, body.password, request.headers.get("user-agent", ""), admin_only=True
    )
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.get("/auth/me", response_model=UserRead)
def admin_session(admin: AdminUser) -> UserRead:
    return UserRead.model_validate(admin)


@router.get("/stats", response_model=Stats)
async def stats(_admin: AdminUser, db: DbSession, settings: AppSettings, ollama: Ollama) -> Stats:
    reachable, available, _detail = await ollama.check_status()
    since = datetime.now(UTC) - timedelta(days=7)
    active = db.scalar(
        select(func.count(func.distinct(AuthToken.user_id))).where(AuthToken.last_used_at >= since)
    )
    return Stats(
        users=_count(db, User),
        active_users_7d=active or 0,
        admins=db.scalar(select(func.count()).where(User.is_admin.is_(True))) or 0,
        disabled=db.scalar(select(func.count()).where(User.is_active.is_(False))) or 0,
        workspaces=_count(db, Workspace),
        notes=_count(db, Note),
        tasks=_count(db, Task),
        boards=_count(db, Board),
        doc_pages=_count(db, DocPage),
        posts=_count(db, BlogPost),
        projects=_count(db, Project),
        files=_count(db, StoredFile),
        storage_bytes=db.scalar(select(func.coalesce(func.sum(StoredFile.size), 0))) or 0,
        drive_files=db.scalar(select(func.count()).where(DriveItem.is_folder.is_(False))) or 0,
        drive_bytes=db.scalar(select(func.coalesce(func.sum(DriveItem.size), 0))) or 0,
        decks=_count(db, SlideDeck),
        flashcards=_count(db, LangCard),
        emails_sent=db.scalar(select(func.count()).where(EmailLog.status == "sent")) or 0,
        emails_failed=db.scalar(select(func.count()).where(EmailLog.status == "failed")) or 0,
        email_enabled=mailer.smtp_config(db, settings).ready,
        ai_reachable=reachable,
        ai_model=ollama.model,
        ai_model_available=available,
    )


@router.get("/users", response_model=list[AdminUserRead])
def users(
    _admin: AdminUser,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
) -> list[AdminUserRead]:
    query = _user_search(search).order_by(User.id).limit(500)
    return _user_rows(db, db.scalars(query).all())


def _user_search(search: str | None) -> Select[User]:
    query = select(User)
    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        query = query.where(
            User.email.ilike(pattern, escape="\\")
            | User.display_name.ilike(pattern, escape="\\")
            | User.first_name.ilike(pattern, escape="\\")
            | User.last_name.ilike(pattern, escape="\\")
        )
    return query


def _user_rows(db: DbSession, rows: Sequence[User]) -> list[AdminUserRead]:
    if not rows:
        return []
    ids = [u.id for u in rows]

    def grouped(statement: object) -> dict[int, int]:
        return {row[0]: row[1] for row in db.execute(statement).all()}  # type: ignore[call-overload]

    last = {
        row[0]: row[1]
        for row in db.execute(
            select(AuthToken.user_id, func.max(AuthToken.last_used_at))
            .where(AuthToken.user_id.in_(ids))
            .group_by(AuthToken.user_id)
        ).all()
    }
    spaces = grouped(
        select(WorkspaceMember.user_id, func.count())
        .where(WorkspaceMember.user_id.in_(ids))
        .group_by(WorkspaceMember.user_id)
    )
    notes = grouped(
        select(Note.user_id, func.count()).where(Note.user_id.in_(ids)).group_by(Note.user_id)
    )
    sizes = grouped(
        select(StoredFile.user_id, func.sum(StoredFile.size))
        .where(StoredFile.user_id.in_(ids))
        .group_by(StoredFile.user_id)
    )
    return [
        AdminUserRead(
            id=u.id,
            email=u.email,
            name=display(u),
            avatar=u.avatar,
            language=u.language,
            is_admin=u.is_admin,
            is_active=u.is_active,
            created_at=u.created_at,
            last_active=last.get(u.id),
            workspaces=spaces.get(u.id, 0),
            notes=notes.get(u.id, 0),
            storage_bytes=int(sizes.get(u.id, 0) or 0),
        )
        for u in rows
    ]


@router.get("/users/directory", response_model=AdminUserDirectory)
def user_directory(
    _admin: AdminUser,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    role: Literal["all", "admin", "member"] = "all",
    state: Literal["all", "active", "disabled"] = "all",
    sort: Literal["newest", "oldest", "activity", "email"] = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AdminUserDirectory:
    query = _user_search(search)
    if role != "all":
        query = query.where(User.is_admin.is_(role == "admin"))
    if state != "all":
        query = query.where(User.is_active.is_(state == "active"))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    if sort == "activity":
        last_used = (
            select(func.max(AuthToken.last_used_at))
            .where(AuthToken.user_id == User.id)
            .scalar_subquery()
        )
        query = query.order_by(last_used.desc().nulls_last())
    elif sort == "email":
        query = query.order_by(User.email)
    elif sort == "newest":
        query = query.order_by(User.id.desc())
    query = query.order_by(User.id).offset((page - 1) * limit).limit(limit)
    all_users, admins, disabled = db.execute(
        select(
            func.count(User.id),
            func.count(User.id).filter(User.is_admin.is_(True)),
            func.count(User.id).filter(User.is_active.is_(False)),
        )
    ).one()
    return AdminUserDirectory(
        items=_user_rows(db, db.scalars(query).all()),
        total=total,
        all_users=all_users,
        admins=admins,
        disabled=disabled,
    )


@router.post("/users", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_user(body: AdminUserCreate, _admin: AdminUser, db: DbSession) -> AdminUserRead:
    user = auth_service.provision_user(
        db,
        body.email,
        body.password,
        body.display_name.strip(),
        body.language,
        is_admin=body.is_admin,
    )
    return _user_rows(db, [user])[0]


@router.get("/users/{user_id}", response_model=AdminUserDetails)
def user_details(user_id: int, _admin: AdminUser, db: DbSession) -> AdminUserDetails:
    user = _user(db, user_id)
    summary = _user_rows(db, [user])[0]
    memberships = db.execute(
        select(Workspace.id, Workspace.name, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.name, Workspace.id)
    ).all()
    return AdminUserDetails(
        **summary.model_dump(),
        display_name=user.display_name,
        sessions=[SessionRead.model_validate(row) for row in auth_service.list_sessions(db, user)],
        memberships=[
            AdminMembership(id=id_, name=name, role=role) for id_, name, role in memberships
        ],
    )


@router.get("/workspaces", response_model=AdminWorkspaceDirectory)
def workspace_directory(
    _admin: AdminUser,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    members: Literal["all", "solo", "team"] = "all",
    sort: Literal["newest", "oldest", "name", "members"] = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AdminWorkspaceDirectory:
    counts = (
        select(WorkspaceMember.workspace_id, func.count(WorkspaceMember.id).label("members"))
        .group_by(WorkspaceMember.workspace_id)
        .subquery()
    )
    member_count = func.coalesce(counts.c.members, 0)
    query = (
        select(Workspace, User, member_count)
        .join(User, User.id == Workspace.owner_id)
        .outerjoin(counts, counts.c.workspace_id == Workspace.id)
    )
    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        query = query.where(
            Workspace.name.ilike(pattern, escape="\\")
            | Workspace.slug.ilike(pattern, escape="\\")
            | User.email.ilike(pattern, escape="\\")
            | User.display_name.ilike(pattern, escape="\\")
        )
    if members == "solo":
        query = query.where(member_count == 1)
    elif members == "team":
        query = query.where(member_count > 1)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    if sort == "newest":
        query = query.order_by(Workspace.id.desc())
    elif sort == "name":
        query = query.order_by(func.lower(Workspace.name))
    elif sort == "members":
        query = query.order_by(member_count.desc())
    rows = db.execute(query.order_by(Workspace.id).offset((page - 1) * limit).limit(limit))
    all_workspaces, solo, team = db.execute(
        select(
            func.count(Workspace.id),
            func.count(Workspace.id).filter(member_count == 1),
            func.count(Workspace.id).filter(member_count > 1),
        )
        .select_from(Workspace)
        .outerjoin(counts, counts.c.workspace_id == Workspace.id)
    ).one()
    return AdminWorkspaceDirectory(
        total=total,
        all_workspaces=all_workspaces,
        solo=solo,
        team=team,
        items=[
            AdminWorkspace(
                id=space.id,
                name=space.name,
                slug=space.slug,
                owner_id=owner.id,
                owner_name=display(owner),
                owner_email=owner.email,
                member_count=count,
                created_at=space.created_at,
            )
            for space, owner, count in rows
        ],
    )


def _workspace(db: DbSession, workspace_id: int, *, lock: bool = False) -> Workspace:
    workspace = db.get(Workspace, workspace_id, with_for_update=lock)
    if workspace is None:
        raise NotFoundError("Workspace not found.", code="workspace_not_found")
    return workspace


def _workspace_details(db: DbSession, workspace: Workspace) -> AdminWorkspaceDetails:
    owner = _user(db, workspace.owner_id)
    members = (
        db.scalar(
            select(func.count(WorkspaceMember.id)).where(
                WorkspaceMember.workspace_id == workspace.id
            )
        )
        or 0
    )
    owned = db.scalar(select(func.count(Workspace.id)).where(Workspace.owner_id == owner.id)) or 0
    return AdminWorkspaceDetails(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        owner_id=owner.id,
        owner_name=display(owner),
        owner_email=owner.email,
        member_count=members,
        created_at=workspace.created_at,
        icon=workspace.icon,
        description=workspace.description,
        settings=WorkspaceSettings.model_validate(workspace.settings or {}),
        only_owned_workspace=owned == 1,
    )


@router.get("/workspaces/{workspace_id}", response_model=AdminWorkspaceDetails)
def workspace_details(workspace_id: int, _admin: AdminUser, db: DbSession) -> AdminWorkspaceDetails:
    return _workspace_details(db, _workspace(db, workspace_id))


@router.post(
    "/workspaces", response_model=AdminWorkspaceDetails, status_code=status.HTTP_201_CREATED
)
def create_workspace(
    body: AdminWorkspaceCreate, _admin: AdminUser, db: DbSession
) -> AdminWorkspaceDetails:
    owner = db.scalar(select(User).where(User.email == body.owner_email).with_for_update())
    if owner is None:
        raise NotFoundError("User not found.", code="user_not_found")
    if not owner.is_active:
        raise InvalidInputError("The account is disabled.", code="account_disabled")
    workspace = workspace_service.create_workspace(db, owner, body)
    db.commit()
    return _workspace_details(db, workspace)


@router.patch("/workspaces/{workspace_id}", response_model=AdminWorkspaceDetails)
def update_workspace(
    workspace_id: int, body: WorkspaceUpdate, _admin: AdminUser, db: DbSession
) -> AdminWorkspaceDetails:
    workspace = _workspace(db, workspace_id, lock=True)
    workspace_service.save_workspace(db, workspace, body.model_dump(exclude_unset=True))
    return _workspace_details(db, workspace)


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(workspace_id: int, _admin: AdminUser, db: DbSession) -> None:
    workspace_service.remove_workspace(db, _workspace(db, workspace_id), replace_last=True)


def _user(db: DbSession, user_id: int, *, lock: bool = False) -> User:
    user = db.get(User, user_id, with_for_update=lock, populate_existing=lock)
    if user is None:
        raise NotFoundError("User not found.", code="user_not_found")
    return user


def _managed_user(db: DbSession, user_id: int, admin: User) -> User:
    if user_id == admin.id:
        raise ForbiddenError("Manage your own account from Settings.", code="admin_self")
    # Serialize admin changes in PostgreSQL so two admins cannot remove each other's access.
    db.scalars(
        select(User.id).where(User.is_admin.is_(True)).order_by(User.id).with_for_update()
    ).all()
    actor = db.get(User, admin.id, populate_existing=True)
    if actor is None or not actor.is_admin or not actor.is_active:
        raise ForbiddenError("Only administrators can do this.", code="admin_only")
    return _user(db, user_id, lock=True)


def _other_active_admins(db: DbSession, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).where(
                User.is_admin.is_(True), User.is_active.is_(True), User.id != user_id
            )
        )
        or 0
    )


@router.patch("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_user(user_id: int, body: AdminUserUpdate, admin: AdminUser, db: DbSession) -> None:
    user = _managed_user(db, user_id, admin)
    removing = body.is_admin is False or body.is_active is False
    if removing and user.is_admin and _other_active_admins(db, user.id) == 0:
        raise InvalidInputError("At least one admin must remain.", code="last_admin")
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.language is not None:
        user.language = body.language
    changed_email = body.email is not None and body.email != user.email
    if body.email is not None and changed_email:
        if auth_service.get_user_by_email(db, body.email) is not None:
            raise ConflictError("An account with this email already exists.", code="email_taken")
        user.email = body.email
        db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    if changed_email or body.is_active is False:
        db.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(
            "An account with this email already exists.", code="email_taken"
        ) from exc


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: AdminUser, db: DbSession, storage: Storage) -> None:
    user = _managed_user(db, user_id, admin)
    auth_service.remove_user(db, storage, user)


@router.delete("/users/{user_id}/sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_user_sessions(user_id: int, admin: AdminUser, db: DbSession) -> None:
    user = _managed_user(db, user_id, admin)
    db.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
    db.commit()


@router.delete("/users/{user_id}/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_user_session(user_id: int, session_id: int, admin: AdminUser, db: DbSession) -> None:
    user = _managed_user(db, user_id, admin)
    auth_service.revoke_session(db, user, session_id)


@router.post("/users/{user_id}/reset-link", response_model=ResetLink)
def reset_link(user_id: int, _admin: AdminUser, db: DbSession, settings: AppSettings) -> ResetLink:
    """Creates a reset link; it is emailed if email is set up, and returned to copy."""
    user = _user(db, user_id, lock=True)
    link, mail = auth_service.reset_mail(db, settings, user)
    status_ = mailer.send(db, settings, mail)
    return ResetLink(link=link, email_status=status_)


@router.get("/settings/email", response_model=SmtpRead)
def get_email(_admin: AdminUser, db: DbSession) -> SmtpRead:
    stored = mailer.get_setting(db, "smtp")
    return SmtpRead(
        **{k: stored[k] for k in SmtpSettings.model_fields if k in stored},
        password_set=bool(stored.get("password")),
    )


@router.put("/settings/email", response_model=SmtpRead)
def put_email(body: SmtpWrite, admin: AdminUser, db: DbSession, settings: AppSettings) -> SmtpRead:
    mailer.save_smtp(db, settings, body.model_dump())
    return get_email(admin, db)


@router.post("/settings/email/test", response_model=TestResult)
def test_email(
    body: TestEmail, admin: AdminUser, db: DbSession, settings: AppSettings
) -> TestResult:
    status_, error = mailer.send_test(db, settings, body.to, admin.language == "fa")
    return TestResult(status=status_, error=error)


@router.get("/settings/general", response_model=GeneralRead)
def get_general(_admin: AdminUser, db: DbSession, settings: AppSettings) -> GeneralRead:
    general = mailer.general(db, settings)
    return GeneralRead(
        app_name=general.app_name,
        app_url=general.app_url,
        allow_registration=general.allow_registration,
    )


@router.put("/settings/general", response_model=GeneralRead)
def put_general(
    body: GeneralRead, admin: AdminUser, db: DbSession, settings: AppSettings
) -> GeneralRead:
    mailer.put_setting(db, "general", body.model_dump())
    return get_general(admin, db, settings)


@router.get("/settings/drive", response_model=DriveSettings, summary="Drive limits")
def get_drive(_admin: AdminUser, db: DbSession) -> DriveSettings:
    return drive_service.settings(db)


@router.put("/settings/drive", response_model=DriveSettings)
def put_drive(body: DriveSettings, _admin: AdminUser, db: DbSession) -> DriveSettings:
    return drive_service.save_settings(db, body)


@router.get("/emails", response_model=list[EmailLogRead], summary="Last 200 emails")
def email_log(_admin: AdminUser, db: DbSession) -> list[EmailLogRead]:
    rows = db.scalars(select(EmailLog).order_by(EmailLog.id.desc()).limit(200)).all()
    return [
        EmailLogRead(
            id=r.id,
            to_email=r.to_email,
            subject=r.subject,
            kind=r.kind,
            status=r.status,
            error=r.error,
            created_at=r.created_at,
        )
        for r in rows
    ]
