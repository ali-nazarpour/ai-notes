"""Language learning routes: decks, cards, study sessions, statistics, songs and AI helpers."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, Ollama, WorkspaceCtx
from app.schemas.v5 import (
    LangAiCards,
    LangAiCardsRequest,
    LangCardCreate,
    LangCardRead,
    LangCardsCreate,
    LangCardUpdate,
    LangDeckCreate,
    LangDeckRead,
    LangDeckUpdate,
    LangExplainRequest,
    LangExplanation,
    LangStats,
    ReviewRequest,
    SongCreate,
    SongRead,
    SongUpdate,
    StudyQueue,
    TranslatedLines,
    TranslateLinesRequest,
)
from app.services import learning as service

router = APIRouter(prefix="/api/learn", tags=["learning"])

# Minutes east of UTC (Tehran = 210), so "today" and streaks follow the user's clock.
TimeZone = Annotated[int, Query(ge=-720, le=840)]


@router.get("/decks", response_model=list[LangDeckRead])
def list_decks(ctx: WorkspaceCtx, db: DbSession) -> list[LangDeckRead]:
    return service.list_decks(db, ctx.ws_id)


@router.post("/decks", response_model=LangDeckRead, status_code=status.HTTP_201_CREATED)
def create_deck(body: LangDeckCreate, ctx: WorkspaceCtx, db: DbSession) -> LangDeckRead:
    return service.deck_reads(db, [service.create_deck(db, ctx, body.model_dump())])[0]


@router.get("/decks/{deck_id}", response_model=LangDeckRead)
def get_deck(deck_id: int, ctx: WorkspaceCtx, db: DbSession) -> LangDeckRead:
    return service.deck_reads(db, [service.get_deck(db, ctx, deck_id)])[0]


@router.patch("/decks/{deck_id}", response_model=LangDeckRead)
def update_deck(
    deck_id: int, body: LangDeckUpdate, ctx: WorkspaceCtx, db: DbSession
) -> LangDeckRead:
    deck = service.get_deck(db, ctx, deck_id, write=True)
    deck = service.update_deck(db, deck, body.model_dump(exclude_unset=True))
    return service.deck_reads(db, [deck])[0]


@router.delete("/decks/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deck(deck_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_deck(db, service.get_deck(db, ctx, deck_id, write=True))


@router.get("/decks/{deck_id}/cards", response_model=list[LangCardRead])
def list_cards(deck_id: int, ctx: WorkspaceCtx, db: DbSession) -> list[LangCardRead]:
    return service.list_cards(db, service.get_deck(db, ctx, deck_id))


@router.post(
    "/decks/{deck_id}/cards", response_model=LangCardRead, status_code=status.HTTP_201_CREATED
)
def create_card(
    deck_id: int, body: LangCardCreate, ctx: WorkspaceCtx, db: DbSession
) -> LangCardRead:
    deck = service.get_deck(db, ctx, deck_id, write=True)
    return service.card_read(service.add_cards(db, deck, [body])[0])


@router.post(
    "/decks/{deck_id}/cards/bulk",
    response_model=list[LangCardRead],
    status_code=status.HTTP_201_CREATED,
    summary="Add many cards (from the AI or an import)",
)
def create_cards(
    deck_id: int, body: LangCardsCreate, ctx: WorkspaceCtx, db: DbSession
) -> list[LangCardRead]:
    deck = service.get_deck(db, ctx, deck_id, write=True)
    return [service.card_read(c) for c in service.add_cards(db, deck, body.cards)]


@router.patch("/cards/{card_id}", response_model=LangCardRead)
def update_card(
    card_id: int, body: LangCardUpdate, ctx: WorkspaceCtx, db: DbSession
) -> LangCardRead:
    card = service.get_card(db, ctx, card_id, write=True)
    return service.card_read(
        service.update_card(db, ctx, card, body.model_dump(exclude_unset=True))
    )


@router.post("/cards/{card_id}/reset", response_model=LangCardRead, summary="Learn from scratch")
def reset_card(card_id: int, ctx: WorkspaceCtx, db: DbSession) -> LangCardRead:
    return service.card_read(service.reset_card(db, service.get_card(db, ctx, card_id, write=True)))


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_card(db, service.get_card(db, ctx, card_id, write=True))


@router.get("/study", response_model=StudyQueue, summary="Cards to study now")
def study(
    ctx: WorkspaceCtx,
    db: DbSession,
    tz: TimeZone = 0,
    deck: int | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    mode: Literal["due", "all", "starred"] = "due",
) -> StudyQueue:
    return service.study_queue(db, ctx, deck, limit, tz, mode)


@router.post("/cards/{card_id}/review", response_model=LangCardRead, summary="Answer a card")
def review(card_id: int, body: ReviewRequest, ctx: WorkspaceCtx, db: DbSession) -> LangCardRead:
    ctx.require_edit()
    card = service.get_card(db, ctx, card_id)
    return service.card_read(service.review(db, ctx, card, body.grade))


@router.get("/stats", response_model=LangStats)
def stats(ctx: WorkspaceCtx, db: DbSession, tz: TimeZone = 0) -> LangStats:
    return service.stats(db, ctx, tz)


@router.get("/songs", response_model=list[SongRead])
def list_songs(ctx: WorkspaceCtx, db: DbSession) -> list[SongRead]:
    return service.list_songs(db, ctx.ws_id)


@router.post("/songs", response_model=SongRead, status_code=status.HTTP_201_CREATED)
def create_song(body: SongCreate, ctx: WorkspaceCtx, db: DbSession) -> SongRead:
    return SongRead.model_validate(service.create_song(db, ctx, body.model_dump()))


@router.get("/songs/{song_id}", response_model=SongRead)
def get_song(song_id: int, ctx: WorkspaceCtx, db: DbSession) -> SongRead:
    return SongRead.model_validate(service.get_song(db, ctx, song_id))


@router.patch("/songs/{song_id}", response_model=SongRead)
def update_song(song_id: int, body: SongUpdate, ctx: WorkspaceCtx, db: DbSession) -> SongRead:
    song = service.get_song(db, ctx, song_id, write=True)
    return SongRead.model_validate(
        service.update_song(db, ctx, song, body.model_dump(exclude_unset=True))
    )


@router.delete("/songs/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_song(song_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_song(db, service.get_song(db, ctx, song_id, write=True))


@router.post("/ai/cards", response_model=LangAiCards, summary="Suggest flashcards")
async def ai_cards(body: LangAiCardsRequest, _ctx: WorkspaceCtx, ollama: Ollama) -> LangAiCards:
    return await service.ai_cards(ollama, body)


@router.post("/ai/explain", response_model=LangExplanation, summary="Explain a word")
async def ai_explain(
    body: LangExplainRequest, _ctx: WorkspaceCtx, ollama: Ollama
) -> LangExplanation:
    return await service.explain(ollama, body)


@router.post("/ai/translate-lines", response_model=TranslatedLines, summary="Translate lyrics")
async def ai_translate_lines(
    body: TranslateLinesRequest, _ctx: WorkspaceCtx, ollama: Ollama
) -> TranslatedLines:
    return await service.translate_lines(ollama, body)
