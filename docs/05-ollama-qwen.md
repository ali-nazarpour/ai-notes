# 5. AI: accuracy and grounding

The assistant runs `qwen3.5:4b` through Ollama's native HTTP API (`/api/chat`, `/api/tags`)
with HTTPX – no SDK. A 4B model is fast enough for a laptop but is easily confused, so
accuracy comes from what the app sends to it and checks afterwards, not from the model alone.

## Pipeline for questions (chat and ask-note)

1. **Scope** – only notes in the categories chosen for the chat (or the single note).
2. **Normalization** (`ai/text.py`) – Arabic letters → Persian, Persian/Arabic digits → ASCII,
   diacritics and tatweel removed, ZWNJ handled, a light stemmer for English and Persian.
3. **Chunking and ranking** (`ai/retrieval.py`) – notes are split into passages and ranked
   with BM25; title matches count double. For follow-ups ("and on Friday?") the previous
   question is added to the query.
4. **Context selection** – if all notes fit `AI_CONTEXT_CHAR_BUDGET` they are sent whole;
   otherwise the best passages are sent and the note is marked `partial="true"`, so the model
   (and the UI) know it saw an excerpt.
5. **Grounded prompt** (`ai/prompts.py`) – notes are wrapped in `<note id title>` tags and
   declared as data; the rules say: use only the notes, never guess names/numbers/dates, say
   clearly when the answer is not in the notes, and cite each statement as `[note:ID]`.
   Tags inside note text are neutralized so a note cannot close its wrapper.
6. **Low temperature** (`OLLAMA_TEMPERATURE=0.1`).
7. **Citation check** – citation variants the model invents (`<note id="7">`, `[note 7, 9]`,
   `(note:7)`) are rewritten to `[note:7]`; citations of notes that were not supplied are
   removed. The UI shows the cited notes as links and warns when an answer has no citation
   or was based on partial notes.
8. **Deep thinking** (optional, per message) – sends `think: true` so the model reasons first.
   Slower (often minutes on a laptop) but more careful. If the model does not support it,
   the request is retried without thinking.

Messages are stored only after a successful answer; the last `AI_HISTORY_MESSAGES` messages
are sent as conversation history.

## Summaries of long notes

Notes larger than the budget are summarized with map-reduce: each chunk is summarized
(at most `AI_SUMMARY_MAX_CHUNKS`), then the partial summaries are combined.

## Translation and editing

- Translation prompts require exact preservation of numbers, names, dates and negations.
- Small models still sometimes shift weekday names (we observed "Friday" → "Thursday" from
  English to Persian). `ai/factcheck.py` therefore compares weekday mentions in the source
  and the output for English↔Persian and corrects them when they can be aligned one-to-one.
- Editing actions (`/api/ai/edit`) work on the selected text, optionally with surrounding
  text as context; results are Markdown, previewed in the editor and inserted only when the
  user accepts.

## Limits and honesty

No prompt fully prevents hallucination. The safeguards above reduce it and make it visible
(sources, warnings), and AI output never changes stored data unless the user inserts it.
Larger models (`OLLAMA_MODEL`) and a bigger `OLLAMA_NUM_CTX` + `AI_CONTEXT_CHAR_BUDGET`
improve quality at the cost of speed and memory.

## Errors

| Situation | Code | HTTP |
|---|---|---|
| Ollama not running | `ollama_unavailable` | 503 |
| Model not installed | `model_not_found` | 503 |
| Took longer than `OLLAMA_TIMEOUT_SECONDS` | `ai_timeout` | 504 |
| Unusable reply from Ollama | `ai_bad_response` | 502 |
| Question too long | `question_too_long` | 422 |
| Note or selection too large for one request (translate, edit) | `context_too_large` | 413 |
| No notes in the chosen categories | `no_notes_in_scope` | 422 |
