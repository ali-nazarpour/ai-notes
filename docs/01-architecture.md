# 1. Architecture

## Services

| Service | Image | Role | Port (host) |
|---|---|---|---|
| `frontend` | nginx + built SPA | Serves the app and service worker, proxies `/api` | `127.0.0.1:5173` |
| `backend` | Python 3.13 / FastAPI | REST API, migrations on start | `127.0.0.1:8000` |
| `db` | PostgreSQL 17 | Users, notes, tasks, categories, chats, file metadata | none |
| `minio` | `cgr.dev/chainguard/minio` | Bytes of uploaded images and videos | none |
| `ollama` | `ollama/ollama` | Runs `qwen3.5:4b`; models mounted from the host | none |

The browser talks only to nginx, so the app and the API share one origin (no CORS in
production, cookies not needed – the API uses bearer tokens).

## Backend layers

```
api/        routes: parse input, call a service, return a schema. No business logic.
services/   business rules and queries (notes, tasks, files, chats, assistant, auth).
models/     SQLAlchemy 2 typed models.             schemas/  Pydantic v2 contracts.
ai/         client.py (Ollama HTTP), text.py (normalization, chunking), retrieval.py (BM25),
            prompts.py (grounded prompts, citations), factcheck.py (translation checks).
storage.py  ObjectStorage protocol with MinioStorage and MemoryStorage.
core/       config, errors, security, logging.
```

Dependencies (database session, settings, storage, the current user, the Ollama client) are
injected with FastAPI `Depends` (`app/api/deps.py`), which is what makes the services testable
without real services.

### Errors

Every domain error is an `AppError` subclass with an HTTP status and a stable machine `code`
(`not_authenticated`, `note_too_long`, `model_not_found`, …). Responses look like:

```json
{ "detail": "English message", "code": "file_too_large", "params": { "max_mb": 20 } }
```

The frontend translates by `code` (`frontend/src/i18n/errors.ts`), so error messages appear
in the user's language; `detail` is the fallback.

## Frontend structure

- `api/` – `request()` (adds the token, maps errors to `ApiError`), typed endpoints, and React
  Query hooks with optimistic updates for tasks and favorites.
- `features/` – one folder per page. The editor and chat pages are lazy-loaded.
- `i18n/` – translation tables and the provider that sets `<html lang dir>`.
- `lib/calendar.ts` – one `CalendarApi` for Gregorian and Jalali; every date in the UI goes
  through it.
- Each signed-in account gets its own `QueryClient`, so cached data never crosses accounts.

## Data flow example: Ask AI

1. The chat page sends `POST /api/chats/{id}/messages` with the question, the category scope
   and the "deep thinking" flag.
2. The service loads the notes in scope, ranks passages with BM25, builds a grounded prompt
   with the last messages of the conversation, and calls Ollama.
3. Citations in the answer are normalized and validated against the notes that were sent.
4. Both messages are stored only after a successful answer and returned with their sources.
