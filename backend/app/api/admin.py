"""
Admin panel: users, app-wide settings (email service, sign-up) and the email log.

Only accounts with ``is_admin`` can call these routes. Admins cannot lock themselves out:
they cannot disable, demote or delete their own account here, and at least one active
admin always remains.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select

from app.api.deps import AdminUser, AppSettings, DbSession, Ollama, Storage
from app.core.errors import ForbiddenError, InvalidInputError, NotFoundError
from app.models import (
    AuthToken,
    BlogPost,
    Board,
    DocPage,
    DriveItem,
    EmailLog,
    LangCard,
    Note,
    Project,
    SlideDeck,
    StoredFile,
    Task,
    User,
    Workspace,
    WorkspaceMember,
)
from app.schemas.auth import _check_email
from app.schemas.v5 import DriveSettings
from app.services import auth as auth_service
from app.services import drive as drive_service
from app.services import mailer
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
    query = select(User).order_by(User.id)
    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        query = query.where(
            User.email.ilike(pattern, escape="\\")
            | User.display_name.ilike(pattern, escape="\\")
            | User.first_name.ilike(pattern, escape="\\")
            | User.last_name.ilike(pattern, escape="\\")
        )
    rows = db.scalars(query.limit(500)).all()
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


def _user(db: DbSession, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.", code="user_not_found")
    return user


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
    user = _user(db, user_id)
    if user.id == admin.id:
        raise ForbiddenError("You cannot change your own admin access.", code="admin_self")
    removing = body.is_admin is False or body.is_active is False
    if removing and user.is_admin and _other_active_admins(db, user.id) == 0:
        raise InvalidInputError("At least one admin must remain.", code="last_admin")
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active
        if not body.is_active:  # sign them out everywhere
            db.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
    db.commit()


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: AdminUser, db: DbSession, storage: Storage) -> None:
    user = _user(db, user_id)
    if user.id == admin.id:
        raise ForbiddenError("Delete your own account from Settings.", code="admin_self")
    auth_service.remove_user(db, storage, user)


@router.post("/users/{user_id}/reset-link", response_model=ResetLink)
def reset_link(user_id: int, _admin: AdminUser, db: DbSession, settings: AppSettings) -> ResetLink:
    """Creates a reset link; it is emailed if email is set up, and returned to copy."""
    user = _user(db, user_id)
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
