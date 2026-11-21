"""
Accounts and sessions.

Login issues a random token; only its SHA-256 is stored with an expiry date. Every request
sends ``Authorization: Bearer <token>``; logging out deletes the row. Forgotten passwords
are reset with a one-time link sent by email (valid for one hour).
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import (
    ConflictError,
    ForbiddenError,
    InvalidInputError,
    NotFoundError,
    UnauthorizedError,
)
from app.core.security import hash_password, hash_token, new_token, verify_password
from app.models import (
    AuthToken,
    Board,
    Category,
    Note,
    PasswordReset,
    StoredFile,
    Task,
    User,
    Workspace,
    WorkspaceMember,
)
from app.services import mailer
from app.services import workspaces as workspaces_service
from app.storage import ObjectStorage

TOKEN_LIFETIME = timedelta(days=30)
RESET_LIFETIME = timedelta(hours=1)
# last_used_at is refreshed at most this often, so normal requests do not write.
_TOUCH_INTERVAL = timedelta(minutes=5)


# Hashed once at import; used to make "unknown email" as slow as "wrong password".
_DUMMY_HASH = hash_password("this password is never used")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def _issue_token(db: Session, user: User, user_agent: str = "") -> str:
    token = new_token()
    now = datetime.now(UTC)
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=now + TOKEN_LIFETIME,
            user_agent=user_agent[:300],
            last_used_at=now,
        )
    )
    return token


def _email_taken() -> ConflictError:
    return ConflictError("An account with this email already exists.", code="email_taken")


def register_user(
    db: Session,
    email: str,
    password: str,
    display_name: str,
    language: str = "en",
    user_agent: str = "",
    *,
    settings: Settings | None = None,
    invite_token: str | None = None,
) -> tuple[User, str]:
    """
    Creates the account, its personal workspace (with default categories) and a first
    session token. The first account, and emails listed in ADMIN_EMAILS, become admins.
    """
    email = normalize_email(email)
    if get_user_by_email(db, email) is not None:
        raise _email_taken()
    is_first_user = db.scalar(select(func.count()).select_from(User)) == 0
    if settings is not None and not is_first_user:
        allowed = mailer.general(db, settings).allow_registration
        invited = bool(invite_token) and workspaces_service.valid_invite_for(
            db, invite_token or "", email
        )
        if not allowed and not invited:
            raise ForbiddenError(
                "Sign-up is closed. Ask an administrator for an invitation.",
                code="registration_closed",
            )

    has_admin = db.scalar(select(User.id).where(User.is_admin.is_(True)).limit(1)) is not None
    admin_emails = settings.admin_email_list if settings is not None else []
    try:
        user, workspace = _new_user(
            db,
            email,
            password,
            display_name,
            language,
            is_admin=not has_admin or email in admin_emails,
        )
        if is_first_user:
            # Notes created before accounts existed belong to the first account.
            db.execute(
                update(Note)
                .where(Note.user_id.is_(None))
                .values(user_id=user.id, workspace_id=workspace.id, updated_at=Note.updated_at)
            )
        token = _issue_token(db, user, user_agent)
        db.commit()
    except IntegrityError as exc:  # a concurrent sign-up with the same email won
        db.rollback()
        raise _email_taken() from exc
    db.refresh(user)
    return user, token


def _new_user(
    db: Session, email: str, password: str, display_name: str, language: str, *, is_admin: bool
) -> tuple[User, Workspace]:
    user = User(
        email=email,
        display_name=display_name,
        password_hash=hash_password(password),
        language=language,
        is_admin=is_admin,
    )
    db.add(user)
    db.flush()
    return user, workspaces_service.create_personal(db, user)


def provision_user(
    db: Session, email: str, password: str, display_name: str, language: str, *, is_admin: bool
) -> User:
    """Create an administrator-provisioned account without issuing a login session."""
    email = normalize_email(email)
    if get_user_by_email(db, email) is not None:
        raise _email_taken()
    try:
        user, _ = _new_user(db, email, password, display_name, language, is_admin=is_admin)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _email_taken() from exc
    return user


def login(
    db: Session, email: str, password: str, user_agent: str = "", *, admin_only: bool = False
) -> tuple[User, str]:
    user = get_user_by_email(db, email)
    if user is None:
        verify_password(password, _DUMMY_HASH)  # same timing as a wrong password
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Wrong email or password.", code="invalid_credentials")
    if admin_only and not user.is_admin:
        raise ForbiddenError("Only administrators can do this.", code="admin_only")
    if not user.is_active:
        raise ForbiddenError("This account has been disabled.", code="account_disabled")
    token = _issue_token(db, user, user_agent)
    db.commit()
    return user, token


def _as_utc(moment: datetime) -> datetime:
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def user_for_token(db: Session, token: str) -> User | None:
    row = db.scalar(select(AuthToken).where(AuthToken.token_hash == hash_token(token)))
    if row is None:
        return None
    now = datetime.now(UTC)
    if _as_utc(row.expires_at) <= now:
        db.delete(row)
        db.commit()
        return None
    if row.last_used_at is None or now - _as_utc(row.last_used_at) > _TOUCH_INTERVAL:
        row.last_used_at = now
        db.commit()
    user = db.get(User, row.user_id)
    return user if user is not None and user.is_active else None


def revoke_token(db: Session, token: str) -> None:
    db.execute(delete(AuthToken).where(AuthToken.token_hash == hash_token(token)))
    db.commit()


def update_profile(db: Session, user: User, changes: dict[str, Any]) -> User:
    """
    Applies a partial profile update. A new email needs the current password and must be
    free; an avatar must be an image the user uploaded.
    """
    password = changes.pop("current_password", None)
    email = changes.get("email")
    if email is not None and email != user.email:
        if not password or not verify_password(password, user.password_hash):
            raise _wrong_password()
        if get_user_by_email(db, email) is not None:
            raise _email_taken()
    avatar = changes.get("avatar")
    if avatar and not _owned_image(db, user.id, avatar.rsplit("/", 1)[-1]):
        raise InvalidInputError("Upload the picture first.", code="file_not_found")
    for field, value in changes.items():
        setattr(user, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _email_taken() from exc
    db.refresh(user)
    return user


def _owned_image(db: Session, user_id: int, file_id: str) -> bool:
    try:
        key = uuid.UUID(file_id)
    except ValueError:
        return False
    row = db.get(StoredFile, key)
    return row is not None and row.user_id == user_id and row.kind == "image"


def list_sessions(db: Session, user: User) -> list[AuthToken]:
    now = datetime.now(UTC)
    rows = db.scalars(
        select(AuthToken)
        .where(AuthToken.user_id == user.id)
        .order_by(AuthToken.last_used_at.desc().nulls_last(), AuthToken.id.desc())
    ).all()
    return [row for row in rows if _as_utc(row.expires_at) > now]


def revoke_session(db: Session, user: User, session_id: int) -> None:
    row = db.get(AuthToken, session_id)
    if row is None or row.user_id != user.id:
        raise NotFoundError("Session not found.", code="session_not_found")
    db.delete(row)
    db.commit()


def revoke_other_sessions(db: Session, user: User, keep_token: str) -> None:
    db.execute(
        delete(AuthToken).where(
            AuthToken.user_id == user.id, AuthToken.token_hash != hash_token(keep_token)
        )
    )
    db.commit()


def _wrong_password() -> InvalidInputError:
    return InvalidInputError("The password is wrong.", code="wrong_password")


def change_password(
    db: Session, user: User, current_password: str, new_password: str, keep_token: str
) -> None:
    """Changes the password and signs out every other session."""
    if not verify_password(current_password, user.password_hash):
        raise _wrong_password()
    user.password_hash = hash_password(new_password)
    db.execute(
        delete(AuthToken).where(
            AuthToken.user_id == user.id, AuthToken.token_hash != hash_token(keep_token)
        )
    )
    db.commit()


def delete_account(db: Session, storage: ObjectStorage, user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise _wrong_password()
    remove_user(db, storage, user)


def remove_user(db: Session, storage: ObjectStorage, user: User) -> None:
    """
    Deletes the user, the workspaces they own and everything in them.

    What they created in other people's workspaces stays there and is handed over to
    that workspace's owner; so do their uploaded files, if they are a member anywhere
    else (the files may be used there). Everything else is deleted from storage.
    """
    shared = db.execute(
        select(Workspace.id, Workspace.owner_id)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id, Workspace.owner_id != user.id)
    ).all()
    for workspace_id, owner_id in shared:
        for model in (Note, Task, Category, Board):
            db.execute(
                update(model)
                .where(model.user_id == user.id, model.workspace_id == workspace_id)
                .values(user_id=owner_id)
            )
    if shared:
        db.execute(
            update(StoredFile).where(StoredFile.user_id == user.id).values(user_id=shared[0][1])
        )
    keys = list(db.scalars(select(StoredFile.object_key).where(StoredFile.user_id == user.id)))
    db.delete(user)
    db.commit()
    storage.delete_keys(keys)


# ---------------------------------------------------------------- password reset


def _reset_link(db: Session, settings: Settings, user: User) -> str:
    token = new_token()
    db.add(
        PasswordReset(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + RESET_LIFETIME,
        )
    )
    db.commit()
    return f"{mailer.general(db, settings).app_url}/reset-password?token={token}"


def reset_mail(db: Session, settings: Settings, user: User) -> tuple[str, mailer.Mail]:
    link = _reset_link(db, settings, user)
    rtl = user.language == "fa"
    mail = mailer.Mail(
        to=user.email,
        subject="بازیابی رمز عبور" if rtl else "Reset your password",
        kind="password_reset",
        heading="بازیابی رمز عبور" if rtl else "Reset your password",
        paragraphs=[
            "برای انتخاب رمز عبور جدید روی دکمه‌ی زیر بزنید."
            if rtl
            else "Use the button below to choose a new password.",
            "اگر شما درخواست نداده‌اید، این ایمیل را نادیده بگیرید."
            if rtl
            else "If you did not ask for this, you can ignore this email.",
        ],
        button=("انتخاب رمز جدید" if rtl else "Choose a new password", link),
        footer="این لینک یک ساعت اعتبار دارد." if rtl else "The link expires in one hour.",
        rtl=rtl,
    )
    return link, mail


def request_reset(db: Session, settings: Settings, email: str) -> None:
    """Sends a reset link if the account exists. The answer is the same either way."""
    user = get_user_by_email(db, email)
    if user is None or not user.is_active:
        return
    _link, mail = reset_mail(db, settings, user)
    mailer.send(db, settings, mail)


def reset_password(db: Session, token: str, new_password: str) -> None:
    row = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == hash_token(token)))
    if row is None or row.used_at is not None or _as_utc(row.expires_at) <= datetime.now(UTC):
        raise InvalidInputError(
            "This reset link is invalid or has expired.", code="reset_link_invalid"
        )
    user = db.get(User, row.user_id)
    if user is None:
        raise InvalidInputError("This reset link is invalid.", code="reset_link_invalid")
    user.password_hash = hash_password(new_password)
    row.used_at = datetime.now(UTC)
    db.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
    db.commit()
