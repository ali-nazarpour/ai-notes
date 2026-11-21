"""Slide deck routes."""

from fastapi import APIRouter, status

from app.api.deps import DbSession, Ollama, WorkspaceCtx
from app.schemas.v5 import (
    DeckAiRequest,
    DeckAiResponse,
    DeckCreate,
    DeckRead,
    DeckSummary,
    DeckUpdate,
)
from app.services import slides as service

router = APIRouter(prefix="/api/slides", tags=["slides"])


@router.get("", response_model=list[DeckSummary], summary="Presentations in this workspace")
def list_decks(ctx: WorkspaceCtx, db: DbSession) -> list[DeckSummary]:
    return service.list_decks(db, ctx.ws_id)


@router.post("", response_model=DeckRead, status_code=status.HTTP_201_CREATED)
def create_deck(body: DeckCreate, ctx: WorkspaceCtx, db: DbSession) -> DeckRead:
    deck = service.create(db, ctx, body.title, body.theme, body.slides, body.category_id)
    return service.read(db, ctx, deck)


@router.post("/ai", response_model=DeckAiResponse, summary="Draft slides with the AI model")
async def ai_draft(body: DeckAiRequest, ctx: WorkspaceCtx, ollama: Ollama) -> DeckAiResponse:
    return await service.ai_draft(ollama, ctx, body)


@router.get("/{deck_id}", response_model=DeckRead)
def get_deck(deck_id: int, ctx: WorkspaceCtx, db: DbSession) -> DeckRead:
    return service.read(db, ctx, service.get_deck(db, ctx, deck_id))


@router.patch("/{deck_id}", response_model=DeckRead)
def update_deck(deck_id: int, body: DeckUpdate, ctx: WorkspaceCtx, db: DbSession) -> DeckRead:
    deck = service.get_deck(db, ctx, deck_id, write=True)
    deck = service.update(db, ctx, deck, body.model_dump(exclude_unset=True))
    return service.read(db, ctx, deck)


@router.post("/{deck_id}/duplicate", response_model=DeckRead, status_code=status.HTTP_201_CREATED)
def duplicate_deck(deck_id: int, ctx: WorkspaceCtx, db: DbSession) -> DeckRead:
    deck = service.get_deck(db, ctx, deck_id)
    suffix = "(کپی)" if ctx.user.language == "fa" else "(copy)"
    return service.read(db, ctx, service.duplicate(db, ctx, deck, suffix))


@router.delete("/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deck(deck_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete(db, service.get_deck(db, ctx, deck_id, write=True))
