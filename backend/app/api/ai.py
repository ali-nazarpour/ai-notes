"""AI routes. They only read notes; model output never changes stored data."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import AppSettings, CurrentUser, DbSession, Ollama, WorkspaceCtx
from app.schemas.ai import (
    AiStatusResponse,
    AskNoteRequest,
    AskNoteResponse,
    EditRequest,
    EditResponse,
    SummarizeRequest,
    SummarizeResponse,
    TranslateRequest,
    TranslateResponse,
)
from app.services import ai_tools, assistant
from app.services import notes as notes_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


class BriefingResponse(BaseModel):
    text: str
    model: str


_ERRORS: dict[int | str, dict[str, str]] = {
    413: {"description": "Too much text for the model (code: context_too_large)"},
    502: {"description": "Invalid model response (code: ai_bad_response)"},
    503: {"description": "Ollama or the model unavailable (ollama_unavailable, model_not_found)"},
    504: {"description": "The model did not answer in time (code: ai_timeout)"},
}


@router.get("/status", response_model=AiStatusResponse, summary="Check Ollama and the model")
async def ai_status(ollama: Ollama) -> AiStatusResponse:
    reachable, available, detail = await ollama.check_status()
    return AiStatusResponse(
        ollama_reachable=reachable, model=ollama.model, model_available=available, detail=detail
    )


@router.post("/summarize", response_model=SummarizeResponse, responses=_ERRORS)
async def summarize(
    body: SummarizeRequest, ctx: WorkspaceCtx, db: DbSession, settings: AppSettings, ollama: Ollama
) -> SummarizeResponse:
    note = notes_service.get_note(db, ctx, body.note_id)
    summary, chunks = await assistant.summarize(ollama, settings, note)
    return SummarizeResponse(note_id=note.id, summary=summary, model=ollama.model, chunks=chunks)


@router.post("/ask-note", response_model=AskNoteResponse, responses=_ERRORS)
async def ask_note(
    body: AskNoteRequest, ctx: WorkspaceCtx, db: DbSession, settings: AppSettings, ollama: Ollama
) -> AskNoteResponse:
    note = notes_service.get_note(db, ctx, body.note_id)
    answer, partial = await assistant.ask_note(ollama, settings, note, body.question, body.thorough)
    return AskNoteResponse(note_id=note.id, answer=answer, model=ollama.model, partial=partial)


@router.post("/translate", response_model=TranslateResponse, responses=_ERRORS)
async def translate(
    body: TranslateRequest, ctx: WorkspaceCtx, db: DbSession, settings: AppSettings, ollama: Ollama
) -> TranslateResponse:
    note = notes_service.get_note(db, ctx, body.note_id)
    translation, name = await assistant.translate(ollama, settings, note, body.target_language)
    return TranslateResponse(
        note_id=note.id,
        target_language=body.target_language,
        language_name=name,
        translation=translation,
        model=ollama.model,
    )


@router.post(
    "/edit",
    response_model=EditResponse,
    responses=_ERRORS,
    summary="Rewrite, translate or continue a piece of text",
)
async def edit(
    body: EditRequest, user: CurrentUser, settings: AppSettings, ollama: Ollama
) -> EditResponse:
    result = await assistant.edit(ollama, settings, body)
    return EditResponse(result=result, model=ollama.model)


@router.post(
    "/generate",
    response_model=ai_tools.GenerateResponse,
    responses=_ERRORS,
    summary="Suggestions: tasks, checklists, cards, outlines, titles, tags, milestones, ...",
)
async def generate(
    body: ai_tools.GenerateRequest, ctx: WorkspaceCtx, settings: AppSettings, ollama: Ollama
) -> ai_tools.GenerateResponse:
    return await ai_tools.generate(ollama, settings, ctx, body)


@router.post(
    "/briefing",
    response_model=BriefingResponse,
    responses=_ERRORS,
    summary="A short summary of what is due today and this week",
)
async def briefing(ctx: WorkspaceCtx, db: DbSession, ollama: Ollama) -> BriefingResponse:
    return BriefingResponse(text=await ai_tools.briefing(ollama, db, ctx), model=ollama.model)
