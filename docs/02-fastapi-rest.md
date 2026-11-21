# 2. API

Interactive documentation: http://localhost:8000/docs (Swagger) when the stack is running.
All routes except registration, login, health and file downloads require
`Authorization: Bearer <token>`.

## Auth – `/api/auth`

| Method | Path | Notes |
|---|---|---|
| POST | `/register` | `{email, password, display_name?, language}` → `{token, user}`; creates default categories in that language |
| POST | `/login` | `{email, password}` → `{token, user}` |
| POST | `/logout` | Revokes the current token |
| GET / PATCH | `/me` | Profile, `theme`, `accent_color`, `language` |
| POST | `/change-password` | `{current_password, new_password}` |
| POST | `/delete-account` | `{password}`; deletes data and uploaded files |

Also under `/api/auth`: `GET /sessions` (signed-in devices), `DELETE /sessions/{id}`,
`POST /sessions/revoke-others`. `PATCH /me` accepts the profile fields `first_name`,
`last_name`, `birth_date`, `phone`, `address`, `bio`, `avatar` (`/api/files/<uuid>` of an
image you uploaded) and `email` (requires `current_password`).

Also: `GET /config` (sign-up and email availability), `POST /forgot-password` (always 202),
`POST /reset-password` `{token, new_password}` (signs out everywhere).

## Workspaces – `/api/workspaces`

Every content route works in one workspace: send `X-Workspace-Id: <id>` (default: your
oldest own workspace). Lists show that workspace; a single note / board / documentation /
project also opens for members of its workspace and people it was shared with.

| Method | Path | Notes |
|---|---|---|
| GET / POST | `` | Your workspaces (with your role) / create one |
| GET / PATCH / DELETE | `/current` | PATCH `name`, `icon`, `description`, `accent_color`, `theme`, `cover`, `settings` (`blog_public`, `ai_enabled`, `default_font`, `full_width`); DELETE owner only, not the last one |
| GET / PATCH / DELETE | `/current/members[/{id}]` | Roles `admin` / `editor` / `viewer`; DELETE your own member id = leave |
| GET / POST / DELETE | `/current/invites[/{id}]` | Invite `{email, role, message}`; returns the link and `email_status` |

`/api/invites`: `GET` (sent to my email), `GET /preview/{token}` (no sign-in),
`POST /accept {token}`, `POST /{id}/accept`, `DELETE /{id}` (decline).
`/api/shares`: `GET ?kind=&item_id=`, `POST {kind, item_id, email, role}`, `PATCH /{id}`,
`DELETE /{id}`, `GET /with-me`. Kinds: `note`, `board`, `doc`, `project`.

## Notes – `/api/notes`

| Method | Path | Notes |
|---|---|---|
| GET | `` | Summaries (no body); `?search=`, `?favorite=true`, `?category_id=` |
| POST | `` | `{title?, content?, body?, category_id?, cover?, is_favorite?}` |
| GET | `/{id}` | Full note including `body` (editor JSON) and `content` (plain text) |
| PATCH | `/{id}` | Partial update; only sent fields change. Toggling a favorite does not touch `updated_at` |
| DELETE | `/{id}` | |

Also: `POST /{id}/trash`, `POST /{id}/restore`, `GET /trash`, `DELETE /trash` (empty),
`GET /{id}/revisions`, `GET /{id}/revisions/{rid}`, `POST /{id}/revisions/{rid}/restore`.
PATCH accepts `settings` (`font`, `small_text`, `full_width`, `toc`, `locked`) and
`workspace_id` (move). A locked note rejects text changes (`note_locked`).

`content` is the plain-text version of `body`, used for search, excerpts and the AI.
Limits: 2,000,000 characters of text and 8 MB of editor JSON per note. `cover` is
`gradient:<name>` or `/api/files/<uuid>`.

## Tasks, categories

- `/api/tasks`: `GET`, `POST {title, due_date?, category_id?}`, `PATCH /{id}`, `DELETE /{id}`.
  `due_date` is a plain `YYYY-MM-DD` (Gregorian; the UI converts to Jalali for display).
- `/api/categories`: `GET` (with note and open-task counts), `POST`, `PUT /{id}`, `DELETE /{id}`
  (notes and tasks in it become uncategorized).

## Files – `/api/files`

| Method | Path | Notes |
|---|---|---|
| POST | `` | Multipart `file`. PNG, JPEG, GIF, WebP, AVIF, MP4, WebM, MOV; type detected from the bytes, not the name. SVG is rejected |
| GET | `/{uuid}` | No auth (capability URL, so `<img>` and `<video>` work). Supports `Range` for video seeking; cached as immutable |

## AI – `/api/ai`

| Method | Path | Body |
|---|---|---|
| GET | `/status` | Is Ollama reachable, is the model installed |
| POST | `/summarize` | `{note_id}` |
| POST | `/ask-note` | `{note_id, question, thorough}` |
| POST | `/translate` | `{note_id, target_language}` |
| POST | `/edit` | `{action, text, instruction?, target_language?, context?}` – actions: `improve`, `fix`, `shorter`, `longer`, `simplify`, `professional`, `friendly`, `translate`, `continue`, `custom` |

## Chats – `/api/chats`

| Method | Path | Notes |
|---|---|---|
| GET | `` | Conversations, newest first |
| POST | `` | `{scope, title?}` |
| GET / PATCH / DELETE | `/{id}` | Messages included in GET; PATCH renames or changes the scope |
| POST | `/{id}/messages` | `{content, scope, thorough}` → `{conversation, user_message, assistant_message}` |

`scope` is `{category_ids: number[] | null, include_uncategorized: boolean}`; `null` means
all categories.

## Boards – `/api/boards`

| Method | Path | Notes |
|---|---|---|
| GET / POST | `` | List (with list/card counts) / create `{title, background, template}`; templates `kanban`, `project`, `weekly`, `personal`, `blank` (list names follow the user's language) |
| GET / PATCH / DELETE | `/{id}` | Full board with lists and card summaries; PATCH `title`, `description`, `background`, `starred`, `labels` |
| GET | `/{id}/archived` | Archived cards |
| POST | `/{id}/lists` | `{title, index?}` |
| PATCH / DELETE | `/{id}/lists/{list_id}` | `title`, `color`, `wip_limit`, `index` (move) |
| POST | `/{id}/lists/{list_id}/sort`, `/{id}/lists/{list_id}/archive-cards` | Sort by `due` / `title` / `newest` / `oldest`; archive every card |
| POST | `/{id}/cards` | `{list_id, title, index?}` |
| GET / PATCH / DELETE | `/{id}/cards/{card_id}` | PATCH any of `title`, `description` (editor JSON) + `description_text`, `label_ids`, `start_date`, `due_date`, `due_done`, `cover`, `checklists`, `attachments`, `archived`, and `list_id` / `index` to move |
| POST | `/{id}/cards/{card_id}/copy` | Copy below the original |
| POST / DELETE | `/{id}/cards/{card_id}/comments`, `.../comments/{comment_id}` | Comments |

Order is dense integers renumbered by the server: clients send *indexes*, never positions.

## Password vault – `/api/vault`

The server only ever sees ciphertext (see [08-accounts-security.md](08-accounts-security.md)).
`GET` key material, `POST` set up, `PUT` change master password (all items re-encrypted in
one transaction), `POST /reset` (account password) and `/items` CRUD with `{data}` blobs.

## Backup – `/api/data`

`GET /summary` (counts), `GET /export` (ZIP download), `POST /import` (multipart ZIP; adds to
the account and returns what was restored).

## Documentation – `/api/docs`

Spaces: `GET` / `POST {title, template: guide|api|handbook|blank, …}`, `GET / PATCH / DELETE /{id}`
(GET includes the page tree), `GET /{id}/search?q=`, `POST /{id}/ask {question}`.
Pages: `POST /{id}/pages {title, parent_id?, index?}`, `POST /{id}/pages/batch`,
`GET / PATCH / DELETE /{id}/pages/{pid}` (DELETE removes sub-pages), `POST .../move
{parent_id, index}` (no cycles), `POST .../duplicate`, and the same revision routes as notes.

## Blog – `/api/blog`

`GET ?status=&search=&tag=`, `POST`, `GET / PATCH / DELETE /{id}`, revisions. PATCH:
`title`, `slug` (unique per workspace), `excerpt`, `body`/`content`, `cover`, `tags`,
`category_id`, `status` (`draft` / `published`), `published_at` (future = scheduled),
`seo_title`, `seo_description`, `featured`. Public (no sign-in, only if the workspace has
`blog_public`): `GET /api/public/blog/{workspace_slug}` and `/{workspace_slug}/{post_slug}`.

## Projects – `/api/projects`

`GET ?archived=`, `POST`, `GET / PATCH / DELETE /{id}`. PATCH any field, including the lists
`members`, `milestones`, `expenses`, `repositories`, `links`, `files`, `notes`, and
`board_id` / `doc_space_id` (same workspace). `progress` null = from milestones.

## AI tools

`POST /api/ai/generate {kind, text, title?, count?, language?}` → `{text}` or `{items}`.
List kinds use Ollama structured output (a JSON schema): `tasks`, `checklist`, `cards`,
`outline`, `doc_pages`, `titles`, `tags`, `milestones`, `risks`. Text kinds: `excerpt`,
`seo`, `project_brief`, `status_report`, `write`, `improve_title`.
`POST /api/ai/briefing` – today's summary. `POST /api/tasks/batch` saves accepted tasks.
Chats accept `scope.sources` (`notes`, `docs`, `blog`, `projects`, `boards`, `tasks`).

## Files

Uploads also accept audio (MP3, M4A, OGG, WAV, FLAC) and documents (PDF, DOCX, XLSX, PPTX,
ZIP, TXT, MD, CSV, JSON); documents are always served as downloads.
`GET /api/files/preview/link?url=` returns title, description and image of a public web page.

## Admin – `/api/admin` (admins only)

`GET /stats`, `GET /users?search=`, `PATCH /users/{id} {is_admin?, is_active?}`,
`DELETE /users/{id}`, `POST /users/{id}/reset-link`, `GET / PUT /settings/email`,
`POST /settings/email/test {to}`, `GET / PUT /settings/general`, `GET /emails`.

## Error codes

Status codes: 401 (not signed in), 404, 409 (e.g. email taken), 413 (too large),
416 (bad range), 422 (validation, with `code`), 502/503/504 (Ollama or storage problems).
See `app/core/errors.py` and `frontend/src/i18n/en.ts` (`errors.*`) for the full list.
