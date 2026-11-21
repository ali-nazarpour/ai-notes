"""Shared route dependencies: database session, settings, user, workspace, AI client, storage."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.ai.client import OllamaClient
from app.core.config import Settings, get_settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.db.session import get_db
from app.models import User
from app.services import auth as auth_service
from app.services import workspaces as workspaces_service
from app.services.access import Ctx
from app.storage import ObjectStorage, get_storage

DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]
Storage = Annotated[ObjectStorage, Depends(get_storage)]

# auto_error=False: a missing header is reported with our own 401 (with an error code).
_bearer = HTTPBearer(auto_error=False, description="The token from /api/auth/login.")


@dataclass
class AuthContext:
    user: User
    token: str


def get_auth(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthContext:
    if credentials is None:
        raise UnauthorizedError()
    user = auth_service.user_for_token(db, credentials.credentials)
    if user is None:
        raise UnauthorizedError()
    return AuthContext(user=user, token=credentials.credentials)


Auth = Annotated[AuthContext, Depends(get_auth)]


def get_current_user(auth: Auth) -> User:
    return auth.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_ctx(
    user: CurrentUser,
    db: DbSession,
    workspace_id: Annotated[
        int | None,
        Header(alias="X-Workspace-Id", description="Workspace to work in (default: your own)."),
    ] = None,
) -> Ctx:
    return workspaces_service.context(db, user, workspace_id)


WorkspaceCtx = Annotated[Ctx, Depends(get_ctx)]


def get_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise ForbiddenError("Only administrators can do this.", code="admin_only")
    return user


AdminUser = Annotated[User, Depends(get_admin)]


def get_ollama_client(settings: AppSettings) -> OllamaClient:
    return OllamaClient(settings)


Ollama = Annotated[OllamaClient, Depends(get_ollama_client)]
