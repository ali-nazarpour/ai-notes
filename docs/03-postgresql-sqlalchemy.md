# 3. Database and storage

## Tables

| Table | Main columns |
|---|---|
| `users` | email (unique, lower-case), password_hash (scrypt), display_name, theme, accent_color, language |
| `auth_tokens` | user_id, token_hash (SHA-256 of the token), created_at, expires_at |
| `categories` | user_id, name, color, icon |
| `notes` | user_id, category_id, title, content (text), body (JSON/JSONB), excerpt, cover, is_favorite, timestamps |
| `tasks` | user_id, category_id, title, is_done, due_date, completed_at |
| `files` | id (UUID), user_id, kind, content_type, size, original_name, object_key |
| `chat_conversations` | user_id, title, scope (JSON), timestamps |
| `chat_messages` | conversation_id, role, content, sources (JSON), meta (JSON) |
| `boards` | user_id, title, description, background, starred, labels (JSON) |
| `board_lists` | board_id, title, position, color, wip_limit |
| `board_cards` | board_id, list_id, title, position, description (JSON) + description_text, label_ids, start/due dates, due_done, cover, checklists (JSON), attachments (JSON), archived |
| `card_comments` | card_id, text |
| `vaults` | user_id (PK), kdf, iterations, salt, verifier |
| `vault_items` | user_id, data (base64 IV + AES-GCM ciphertext) |
| `workspaces` | name, slug (unique), icon, description, accent_color, theme, cover, settings (JSON), owner_id |
| `workspace_members` | workspace_id, user_id, role (unique per workspace + user) |
| `workspace_invites` | workspace_id, email, role, token_hash, invited_by, expires_at, accepted_at |
| `shares` | workspace_id, kind, item_id, user_id, role, shared_by |
| `doc_spaces` / `doc_pages` | documentation and its page tree (parent_id, position) |
| `blog_posts` | title, slug (unique per workspace), body/content, status, published_at, SEO fields, tags |
| `projects` | schedule, budget, status, links and JSON lists (milestones, expenses, members, …) |
| `revisions` | kind, item_id, title, body, content (saved versions) |
| `app_settings` | key → JSON (`smtp`, `general`) |
| `email_log` | to_email, subject, kind, status, error |
| `password_resets` | user_id, token_hash, expires_at, used_at |

Content tables (`categories`, `notes`, `tasks`, `chat_conversations`, `boards` and the new
ones) have a `workspace_id`; `user_id` is the author. Notes also have `settings`,
`deleted_at` (trash) and `updated_by`.

`users` also has the profile fields and `avatar`; `auth_tokens` has `user_agent` and
`last_used_at` (refreshed at most every 5 minutes).

`body` uses `JSONType` (`app/db/base.py`): JSONB on PostgreSQL, JSON on SQLite in tests.
`excerpt` (first 280 characters) is stored so the notes list never loads full note text;
list queries use `load_only` on summary columns.

## Migrations

Alembic migrations live in `backend/alembic/versions` and run automatically when the backend
container starts (`alembic upgrade head`). They are additive; `0004` adds rich notes, files,
chats and the language column and back-fills excerpts; `0005` adds the profile fields,
session details, the password vault and boards; `0006` creates a personal workspace for
every user, moves their existing content into it (only `workspace_id` is filled in), makes
the oldest account admin and adds the tables above. `0006` was tested up → down → up on a
copy of a real database before being applied. To run manually:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic history
```

Back up before upgrading a database you care about:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup.sql
```

## Object storage

Uploaded bytes go to MinIO (S3-compatible) under `"{user_id}/{uuid}"`; PostgreSQL stores only
the metadata. The bucket is created on first use. Deleting an account deletes the user's own
files (files of members who still belong to other workspaces are kept there). Files are served through the API (`/api/files/{uuid}`), never directly from MinIO,
so MinIO has no published ports.

`app/storage.py` defines a small `ObjectStorage` protocol (`put`, `open`, `delete_prefix`, `delete_keys`);
tests use `MemoryStorage`. Any S3-compatible service can replace MinIO by changing the
`MINIO_*` settings.
