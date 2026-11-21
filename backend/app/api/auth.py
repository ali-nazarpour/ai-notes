"""Account routes."""

from fastapi import APIRouter, Request, status

from app.api.deps import AppSettings, Auth, CurrentUser, DbSession, Storage
from app.core.security import hash_token
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    ForgotPasswordRequest,
    LoginRequest,
    PublicConfig,
    RegisterRequest,
    ResetPasswordRequest,
    SessionRead,
    UserRead,
    UserUpdate,
)
from app.services import auth as auth_service
from app.services import mailer

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _agent(request: Request) -> str:
    return request.headers.get("user-agent", "")[:300]


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account and sign in",
    responses={409: {"description": "Email already registered (code: email_taken)"}},
)
def register(
    body: RegisterRequest, db: DbSession, request: Request, settings: AppSettings
) -> AuthResponse:
    user, token = auth_service.register_user(
        db,
        body.email,
        body.password,
        body.display_name,
        body.language,
        _agent(request),
        settings=settings,
        invite_token=body.invite_token,
    )
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Sign in with email and password",
    responses={401: {"description": "Wrong email or password (code: invalid_credentials)"}},
)
def login(body: LoginRequest, db: DbSession, request: Request) -> AuthResponse:
    user, token = auth_service.login(db, body.email, body.password, _agent(request))
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Sign out this session")
def logout(auth: Auth, db: DbSession) -> None:
    auth_service.revoke_token(db, auth.token)


@router.get("/me", response_model=UserRead, summary="The signed-in user")
def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", response_model=UserRead, summary="Update profile and preferences")
def update_me(body: UserUpdate, user: CurrentUser, db: DbSession) -> UserRead:
    updated = auth_service.update_profile(db, user, body.model_dump(exclude_unset=True))
    return UserRead.model_validate(updated)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the password (signs out all other sessions)",
)
def change_password(body: ChangePasswordRequest, auth: Auth, db: DbSession) -> None:
    auth_service.change_password(
        db, auth.user, body.current_password, body.new_password, keep_token=auth.token
    )


@router.post(
    "/delete-account",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete the account and all of its data",
)
def delete_account(
    body: DeleteAccountRequest, user: CurrentUser, db: DbSession, storage: Storage
) -> None:
    auth_service.delete_account(db, storage, user, body.password)


@router.get("/sessions", response_model=list[SessionRead], summary="Signed-in devices")
def sessions(auth: Auth, db: DbSession) -> list[SessionRead]:
    current = hash_token(auth.token)
    return [
        SessionRead.model_validate(row).model_copy(update={"current": row.token_hash == current})
        for row in auth_service.list_sessions(db, auth.user)
    ]


@router.delete(
    "/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Sign out a device"
)
def revoke_session(session_id: int, user: CurrentUser, db: DbSession) -> None:
    auth_service.revoke_session(db, user, session_id)


@router.post(
    "/sessions/revoke-others",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign out every other device",
)
def revoke_others(auth: Auth, db: DbSession) -> None:
    auth_service.revoke_other_sessions(db, auth.user, auth.token)


@router.get("/config", response_model=PublicConfig, summary="Sign-up and email availability")
def public_config(db: DbSession, settings: AppSettings) -> PublicConfig:
    general = mailer.general(db, settings)
    return PublicConfig(
        app_name=general.app_name,
        allow_registration=general.allow_registration,
        email_enabled=mailer.smtp_config(db, settings).ready,
    )


@router.post(
    "/forgot-password",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Email a password reset link (same answer whether or not the account exists)",
)
def forgot_password(body: ForgotPasswordRequest, db: DbSession, settings: AppSettings) -> None:
    auth_service.request_reset(db, settings, body.email)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set a new password with the link from the email (signs out everywhere)",
)
def reset_password(body: ResetPasswordRequest, db: DbSession) -> None:
    auth_service.reset_password(db, body.token, body.new_password)
