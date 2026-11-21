"""
AI features on top of the Ollama client: summary, question about one note, translation,
writing help, and answers for Ask-AI conversations.

Model output is only returned and displayed; it never changes stored notes.
"""

from dataclasses import dataclass

from app.ai import factcheck, prompts
from app.ai.client import Message, OllamaClient
from app.ai.retrieval import NoteText, SelectedNote, Selection, select_context
from app.ai.text import chunk_text
from app.core.config import Settings
from app.core.errors import InvalidInputError, PayloadTooLargeError
from app.models import Note
from app.schemas.ai import SUPPORTED_LANGUAGES, EditRequest


def _too_large(what: str, size: int, budget: int) -> PayloadTooLargeError:
    return PayloadTooLargeError(
        f"{what} ({size} characters) is larger than the AI context budget ({budget}).",
        code="context_too_large",
        size=size,
        budget=budget,
    )


def check_question(question: str, settings: Settings) -> None:
    if len(question) > settings.ai_max_question_chars:
        raise InvalidInputError(
            f"The question is too long (max {settings.ai_max_question_chars} characters).",
            code="question_too_long",
            limit=settings.ai_max_question_chars,
        )


def _as_note_text(note: Note) -> NoteText:
    return NoteText(id=note.id, title=note.title, content=note.content)


async def summarize(ollama: OllamaClient, settings: Settings, note: Note) -> tuple[str, int]:
    """
    Summarizes a note. Long notes are summarized part by part ("map"), then the partial
    summaries are combined ("reduce"). Returns (summary, number of parts).
    """
    budget = settings.ai_context_char_budget
    whole = select_context([_as_note_text(note)], "", budget)
    if not whole.partial:
        return await ollama.complete(prompts.SUMMARIZE_SYSTEM, prompts.format_selection(whole)), 1

    parts = chunk_text(note.content, size=budget - 500, overlap=200)
    if len(parts) > settings.ai_summary_max_chunks:
        raise _too_large("This note", len(note.content), budget * settings.ai_summary_max_chunks)

    partial_summaries = []
    for index, part in enumerate(parts, start=1):
        piece = Selection(notes=[_part(note, f"{note.title} ({index}/{len(parts)})", part)])
        partial_summaries.append(
            await ollama.complete(prompts.SUMMARIZE_SYSTEM, prompts.format_selection(piece))
        )
    combined = Selection(
        notes=[
            _part(note, f"{note.title} (part {index})", text)
            for index, text in enumerate(partial_summaries, start=1)
        ]
    )
    summary = await ollama.complete(
        prompts.COMBINE_SUMMARIES_SYSTEM, prompts.format_selection(combined)
    )
    return summary, len(parts)


def _part(note: Note, title: str, text: str) -> SelectedNote:
    return SelectedNote(id=note.id, title=title, passages=[text], partial=True)


async def ask_note(
    ollama: OllamaClient, settings: Settings, note: Note, question: str, thorough: bool
) -> tuple[str, bool]:
    check_question(question, settings)
    selection = select_context([_as_note_text(note)], question, settings.ai_context_char_budget)
    context = prompts.format_selection(selection) or "<note>(no relevant part found)</note>"
    answer = await ollama.complete(
        prompts.ASK_NOTE_SYSTEM, f"{context}\n\nQuestion: {question}", think=thorough
    )
    # One note: citations add nothing, so any the model wrote are removed.
    return prompts.normalize_citations(answer, set()), selection.partial


async def translate(
    ollama: OllamaClient, settings: Settings, note: Note, language: str
) -> tuple[str, str]:
    budget = settings.ai_context_char_budget
    selection = select_context([_as_note_text(note)], "", budget)
    if selection.partial:
        raise _too_large("This note", len(note.content), budget)
    name = SUPPORTED_LANGUAGES[language]
    translation = await ollama.complete(
        prompts.translate_system(name), prompts.format_selection(selection)
    )
    source = f"{note.title}\n{note.content}"
    source_lang = factcheck.detect_en_or_fa(source)
    if source_lang:
        translation = factcheck.fix_weekdays(source, translation, source_lang, language)
    return translation, name


async def edit(ollama: OllamaClient, settings: Settings, request: EditRequest) -> str:
    if len(request.text) > settings.ai_max_edit_chars:
        raise _too_large("The selected text", len(request.text), settings.ai_max_edit_chars)
    context = request.context
    if context:
        room = max(settings.ai_context_char_budget - len(request.text), 0) // 2
        # The text right before the cursor matters most when continuing.
        context = context[-room:] if room else None
    language = SUPPORTED_LANGUAGES.get(request.target_language or "")
    system = prompts.edit_system(request.action, request.instruction, language)
    temperature = 0.1 if request.action in ("fix", "translate") else 0.5
    result = await ollama.complete(
        system, prompts.edit_user_message(request.text, context), temperature=temperature
    )
    if request.action == "translate" and request.target_language:
        source_lang = factcheck.detect_en_or_fa(request.text)
        if source_lang:
            result = factcheck.fix_weekdays(
                request.text, result, source_lang, request.target_language
            )
    return result


@dataclass
class ChatAnswer:
    content: str
    selection: Selection
    cited_note_ids: list[int]


async def answer_chat(
    ollama: OllamaClient,
    settings: Settings,
    notes: list[NoteText],
    history: list[Message],
    question: str,
    thorough: bool,
) -> ChatAnswer:
    """
    Answers the latest question from the notes in scope. The previous user question is
    added to the search query, so short follow-ups ("and on Friday?") still find the
    right notes. Earlier turns are sent as context, shortened to fit the budget.
    """
    check_question(question, settings)

    trimmed_history = [
        {"role": m["role"], "content": m["content"][:1500]}
        for m in history[-settings.ai_history_messages :]
    ]
    history_size = sum(len(m["content"]) for m in trimmed_history)
    budget = max(settings.ai_context_char_budget - history_size - len(question), 2000)
    previous_question = next(
        (m["content"] for m in reversed(trimmed_history) if m["role"] == "user"), ""
    )
    selection = select_context(notes, f"{question}\n{previous_question}", budget)

    context = prompts.format_selection(selection)
    if not context:
        context = "(No workspace content matched this question.)"
    messages: list[Message] = [
        {"role": "system", "content": prompts.CHAT_SYSTEM},
        *trimmed_history,
        {"role": "user", "content": f"{context}\n\nQuestion: {question}"},
    ]
    answer = prompts.normalize_citations(
        await ollama.chat(messages, think=thorough), selection.note_ids
    )
    return ChatAnswer(
        content=answer,
        selection=selection,
        cited_note_ids=prompts.extract_cited_ids(answer, selection.note_ids),
    )
