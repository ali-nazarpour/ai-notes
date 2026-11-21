"""Ask-AI conversations: history, the note scope, and sending a question."""

from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.client import Message, OllamaClient
from app.ai.text import excerpt
from app.core.config import Settings
from app.core.errors import NotFoundError
from app.models import ChatConversation, ChatMessage
from app.schemas.chat import (
    ChatCreate,
    ChatMessageCreate,
    ChatMessageRead,
    ChatRead,
    ChatReply,
    ChatScope,
    ChatSource,
    ChatSummary,
)
from app.services import assistant, knowledge
from app.services.access import Ctx


def list_chats(db: Session, ctx: Ctx) -> list[ChatConversation]:
    """The user's own conversations in the current workspace (chats are private)."""
    return list(
        db.scalars(
            select(ChatConversation)
            .where(
                ChatConversation.user_id == ctx.user_id,
                ChatConversation.workspace_id == ctx.ws_id,
            )
            .order_by(ChatConversation.updated_at.desc(), ChatConversation.id.desc())
        )
    )


def get_chat(db: Session, ctx: Ctx, chat_id: int) -> ChatConversation:
    chat = db.get(ChatConversation, chat_id)
    if chat is None or chat.user_id != ctx.user_id or chat.workspace_id != ctx.ws_id:
        raise NotFoundError("Conversation not found.", code="chat_not_found")
    return chat


def _messages(db: Session, chat_id: int) -> list[ChatMessage]:
    return list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == chat_id)
            .order_by(ChatMessage.id)
        )
    )


def to_message_read(message: ChatMessage) -> ChatMessageRead:
    meta: dict[str, Any] = message.meta or {}
    return ChatMessageRead(
        id=message.id,
        role=cast(Any, message.role),
        content=message.content,
        sources=[ChatSource(**source) for source in (message.sources or [])],
        cited_note_ids=list(meta.get("cited_note_ids", [])),
        partial=bool(meta.get("partial", False)),
        created_at=message.created_at,
    )


def to_chat_read(db: Session, chat: ChatConversation) -> ChatRead:
    summary = ChatSummary.model_validate(chat)
    return ChatRead(
        **summary.model_dump(), messages=[to_message_read(m) for m in _messages(db, chat.id)]
    )


def create_chat(db: Session, ctx: Ctx, data: ChatCreate) -> ChatConversation:
    chat = ChatConversation(
        user_id=ctx.user_id,
        workspace_id=ctx.ws_id,
        title=data.title.strip(),
        scope=data.scope.model_dump(),
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def update_chat(db: Session, chat: ChatConversation, changes: dict[str, Any]) -> ChatConversation:
    if "title" in changes:
        chat.title = changes["title"].strip()
    if "scope" in changes:
        chat.scope = ChatScope.model_validate(changes["scope"]).model_dump()
    db.commit()
    db.refresh(chat)
    return chat


def delete_chat(db: Session, chat: ChatConversation) -> None:
    db.delete(chat)
    db.commit()


async def send_message(
    db: Session,
    ollama: OllamaClient,
    settings: Settings,
    chat: ChatConversation,
    data: ChatMessageCreate,
) -> ChatReply:
    """
    Answers a question. Both messages are stored only after the model answered, so a
    failed request leaves the history unchanged and can simply be retried.
    """
    if data.scope is not None:
        chat.scope = data.scope.model_dump()
    scope = ChatScope.model_validate(chat.scope or {})
    notes, refs = knowledge.gather(db, chat.workspace_id, scope, data.vault)
    history: list[Message] = [
        {"role": m.role, "content": m.content} for m in _messages(db, chat.id)
    ]

    answer = await assistant.answer_chat(
        ollama, settings, notes, history, data.content, data.thorough
    )

    user_message = ChatMessage(conversation_id=chat.id, role="user", content=data.content)
    assistant_message = ChatMessage(
        conversation_id=chat.id,
        role="assistant",
        content=answer.content,
        sources=[
            {
                "id": n.id,
                "title": n.title,
                "kind": refs[n.id].kind if n.id in refs else "note",
                "url": refs[n.id].url if n.id in refs else f"/notes/{n.id}",
            }
            for n in answer.selection.notes
        ],
        meta={
            "cited_note_ids": answer.cited_note_ids,
            "partial": answer.selection.partial,
            "model": ollama.model,
        },
    )
    if not chat.title:
        chat.title = excerpt(data.content, 80)
    chat.updated_at = func.now()
    db.add_all([user_message, assistant_message])
    db.commit()
    db.refresh(chat)
    db.refresh(user_message)
    db.refresh(assistant_message)
    return ChatReply(
        conversation=ChatSummary.model_validate(chat),
        user_message=to_message_read(user_message),
        assistant_message=to_message_read(assistant_message),
    )
