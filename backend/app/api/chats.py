"""Ask-AI conversation routes."""

from fastapi import APIRouter, status

from app.api.deps import AppSettings, DbSession, Ollama, WorkspaceCtx
from app.schemas.chat import (
    ChatCreate,
    ChatMessageCreate,
    ChatRead,
    ChatReply,
    ChatSummary,
    ChatUpdate,
)
from app.services import chats as chats_service

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("", response_model=list[ChatSummary], summary="Conversation history")
def list_chats(ctx: WorkspaceCtx, db: DbSession) -> list[ChatSummary]:
    return [ChatSummary.model_validate(chat) for chat in chats_service.list_chats(db, ctx)]


@router.post("", response_model=ChatSummary, status_code=status.HTTP_201_CREATED)
def create_chat(body: ChatCreate, ctx: WorkspaceCtx, db: DbSession) -> ChatSummary:
    return ChatSummary.model_validate(chats_service.create_chat(db, ctx, body))


@router.get("/{chat_id}", response_model=ChatRead, summary="A conversation with its messages")
def get_chat(chat_id: int, ctx: WorkspaceCtx, db: DbSession) -> ChatRead:
    return chats_service.to_chat_read(db, chats_service.get_chat(db, ctx, chat_id))


@router.patch("/{chat_id}", response_model=ChatSummary, summary="Rename or change the scope")
def update_chat(chat_id: int, body: ChatUpdate, ctx: WorkspaceCtx, db: DbSession) -> ChatSummary:
    chat = chats_service.get_chat(db, ctx, chat_id)
    updated = chats_service.update_chat(db, chat, body.model_dump(exclude_unset=True))
    return ChatSummary.model_validate(updated)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(chat_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    chats_service.delete_chat(db, chats_service.get_chat(db, ctx, chat_id))


@router.post(
    "/{chat_id}/messages",
    response_model=ChatReply,
    status_code=status.HTTP_201_CREATED,
    summary="Ask a question in a conversation",
)
async def send_message(
    chat_id: int,
    body: ChatMessageCreate,
    ctx: WorkspaceCtx,
    db: DbSession,
    settings: AppSettings,
    ollama: Ollama,
) -> ChatReply:
    chat = chats_service.get_chat(db, ctx, chat_id)
    return await chats_service.send_message(db, ollama, settings, chat, body)
