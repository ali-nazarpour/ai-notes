# 7. Testing and CI

## Backend (`backend/tests`)

```bash
cd backend
pytest            # tests
ruff check .      # lint
ruff format .     # format
mypy app          # types (strict on definitions, pydantic plugin)
```

The fixtures in `conftest.py` give each test a fresh in-memory SQLite database, an
in-memory object store and a fake Ollama client whose replies the test sets, so no external
service is needed. Suites cover auth and accounts, notes (partial updates, limits, search,
excerpts), categories, tasks, files (type detection, size limits, ranges, ownership), AI
endpoints (prompt contents, error mapping, map-reduce summaries, thinking fallback), chats
(scope, history, stored messages) and pure units (normalization, BM25 retrieval, citation
normalization, weekday correction).

## Frontend (`frontend/src`)

```bash
cd frontend
npm test          # Vitest
npm run lint      # oxlint
npm run format:check
npm run typecheck
```

- Unit tests: Jalali/Gregorian calendar, Markdown conversion, translation completeness, API
  client (tokens, error codes, 401 handling).
- Page tests (`App.test.tsx`) render the real app against a fake backend
  (`test/server.ts`): sign-in and language switch to RTL, translated server errors,
  dashboard content in English and Persian, notes filters, the chat scope sent to the API,
  and settings.
- `test/setup.ts` adds browser APIs that jsdom lacks (layout methods for ProseMirror,
  `matchMedia`) and resets storage between tests.

On Windows, run Vitest from a path whose drive letter is lowercase (`c:\…`), as a
case mismatch makes Vitest load two copies of itself ("failed to find the runner").

## CI

`.github/workflows/ci.yml` runs on every push and pull request with read-only permissions:
backend lint, format check, mypy and pytest; frontend lint, format check, type check +
production build and tests. Nothing is deployed.
