"""FastAPI application factory: middleware, error handlers and routers."""

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    admin,
    ai,
    alarms,
    auth,
    blog,
    boards,
    calendar,
    categories,
    chats,
    data,
    docs,
    drive,
    files,
    health,
    learning,
    notes,
    projects,
    search,
    slides,
    tasks,
    vault,
    workspaces,
)
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import setup_logging

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(
        title="AI Notes Assistant API",
        version="1.0.0",
        description=(
            "Notes, tasks, categories, file uploads and a local AI assistant (Ollama). "
            "Register or log in under /api/auth, then press 'Authorize' and paste the token. "
            "Errors have the shape {detail, code, params}."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization", "Range", "X-Workspace-Id"],
    )

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message, "code": exc.code, "params": exc.params},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": jsonable_encoder(exc.errors()), "code": "validation_error"},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500, content={"detail": "Internal server error.", "code": "internal"}
        )

    for module in (
        health,
        auth,
        workspaces,
        notes,
        categories,
        tasks,
        files,
        ai,
        chats,
        boards,
        docs,
        blog,
        projects,
        drive,
        slides,
        learning,
        search,
        alarms,
        calendar,
        vault,
        data,
        admin,
    ):
        app.include_router(module.router)
    app.include_router(workspaces.invites)
    app.include_router(workspaces.shares)
    app.include_router(blog.public)
    app.include_router(drive.public)
    return app


app = create_app()
