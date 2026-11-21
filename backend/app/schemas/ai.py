"""AI schemas: summary, question about one note, translation, writing help, status."""

from typing import Literal, Self

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import strip_required

# Language code -> English name. The client only sends the code; the server puts its own
# name into the prompt, so a client cannot inject text into the instructions this way.
SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "fa": "Persian",
    "ar": "Arabic",
    "tr": "Turkish",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
    "ko": "Korean",
    "hi": "Hindi",
}


def _check_language(value: str) -> str:
    value = value.strip().lower()
    if value not in SUPPORTED_LANGUAGES:
        raise ValueError(
            f"Unsupported language. Supported codes: {', '.join(SUPPORTED_LANGUAGES)}."
        )
    return value


class SummarizeRequest(BaseModel):
    note_id: int


class SummarizeResponse(BaseModel):
    note_id: int
    summary: str
    model: str
    chunks: int = Field(description="How many parts of the note were summarized separately.")


class AskNoteRequest(BaseModel):
    note_id: int
    question: str = Field(min_length=1, max_length=4000)
    thorough: bool = Field(default=False, description="Let the model reason first (slower).")

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, value: str) -> str:
        return strip_required(value, "Question")


class AskNoteResponse(BaseModel):
    note_id: int
    answer: str
    model: str
    partial: bool = Field(description="True if only the most relevant parts were read.")


class TranslateRequest(BaseModel):
    note_id: int
    target_language: str

    _language = field_validator("target_language")(_check_language)


class TranslateResponse(BaseModel):
    note_id: int
    target_language: str
    language_name: str
    translation: str
    model: str


EditAction = Literal[
    "improve",
    "fix",
    "shorter",
    "longer",
    "simplify",
    "professional",
    "friendly",
    "translate",
    "continue",
    "custom",
]


class EditRequest(BaseModel):
    """Rewrite a piece of text, continue writing, or follow a custom instruction."""

    action: EditAction
    text: str = Field(default="", max_length=50_000, description="The selected text.")
    instruction: str | None = Field(default=None, max_length=1000)
    target_language: str | None = None
    context: str | None = Field(
        default=None, max_length=200_000, description="Surrounding note text, for context."
    )

    @field_validator("target_language")
    @classmethod
    def check_language(cls, value: str | None) -> str | None:
        return _check_language(value) if value is not None else None

    @model_validator(mode="after")
    def check_combination(self) -> Self:
        if self.action == "custom" and not (self.instruction or "").strip():
            raise ValueError("A custom edit needs an instruction.")
        if self.action == "translate" and self.target_language is None:
            raise ValueError("A translation needs target_language.")
        needs_text = self.action not in ("custom", "continue")
        if needs_text and not self.text.strip():
            raise ValueError("This action needs some text.")
        if self.action == "continue" and not (self.text.strip() or (self.context or "").strip()):
            raise ValueError("Continuing needs some text before the cursor.")
        return self


class EditResponse(BaseModel):
    result: str
    model: str


class AiStatusResponse(BaseModel):
    ollama_reachable: bool
    model: str
    model_available: bool
    detail: str
