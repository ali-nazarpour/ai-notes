# 8. Accounts and security

The app has simple accounts: an email and a password, nothing else. There is deliberately no
confirmation email and no "forgot password" mail, so the whole idea fits in a few files:

| File | Job |
|---|---|
| `backend/app/core/security.py` | Hashing passwords, creating and hashing tokens |
| `backend/app/models/user.py` | The `users` and `auth_tokens` tables |
| `backend/app/services/auth.py` | Register, login, sessions, password change, account deletion |
| `backend/app/api/deps.py` | `get_current_user`: the check that runs before protected routes |
| `backend/app/api/auth.py` | The `/api/auth/...` routes |
| `frontend/src/store/accounts.ts` | Which accounts this browser is signed in to |
| `frontend/src/api/client.ts` | Adds the token to every request; reacts to 401 |

## Storing passwords

A password is **never stored**. We store a *hash*: the output of a one-way function.

```
scrypt$16384$8$1$<salt>$<hash>
```

- **scrypt** is slow and memory-hungry on purpose (about 50 ms and 16 MB per hash). For you that
  is nothing; for an attacker who stole the database it turns billions of guesses into a few.
- A random **salt** per password means two users with the same password get different hashes,
  and precomputed tables of common passwords are useless.
- The parameters are part of the string, so hashing can be made stronger later without breaking
  passwords saved with the old settings.
- Checking uses `hmac.compare_digest`, which takes the same time whether the first or the last
  byte differs, so timing reveals nothing.

## Login tokens (sessions)

```
1. POST /api/auth/login  {"email", "password"}
2. server: password OK -> token = 43 random characters
           stores SHA-256(token) in auth_tokens (with an expiry date, 30 days)
           returns the token itself  <- the only moment it exists in plain form
3. browser: keeps the token, sends  Authorization: Bearer <token>  with every request
4. server, on every request: SHA-256(received token) -> look it up -> user, or 401
5. POST /api/auth/logout deletes that row: the token stops working immediately
```

Why store only the hash of the token? If the database leaks, the hashes cannot be used to log in.
(A fast hash is fine here, unlike for passwords, because the token is long and random.)

Why a token in a table instead of a JWT? A row can be deleted, so "sign out" and "sign out all
other sessions after a password change" really work, and the idea is easy to see in the database.

## The check before every protected route

```python
@router.get("/api/notes")
def list_notes(user: CurrentUser, db: DbSession): ...
```

`CurrentUser` is a dependency. FastAPI runs `get_current_user` before the route: no header, an
unknown token or an expired one -> **401** with `WWW-Authenticate: Bearer`, and the route never runs.
A route cannot forget the check: if it asks for the user, the check already happened.

## Keeping accounts apart

Every service function takes the user's id, and every query is limited to it:

```python
select(Note).where(Note.user_id == user_id)
```

Reading one row checks the owner too. Someone else's note gives **404, not 403**: a 403 would
confirm that a note with that id exists. A note or task can only point to one of *your*
categories (otherwise 422). The tests `test_users_cannot_see_or_change_each_others_notes` and
`test_users_cannot_use_each_others_categories_or_tasks` prove this.

## Small details that matter

| Detail | Why |
|---|---|
| Emails are trimmed and lower-cased | `Ali@x.com` and `ali@x.com` are one account |
| Same 401 message for wrong email and wrong password | Otherwise anyone could test which emails have an account |
| Unknown email still runs a dummy hash | Otherwise the faster answer would also reveal it |
| Password change signs out all other sessions | Someone who knew the old password is really locked out |
| Account deletion asks for the password again | Protects an unlocked computer; the database then deletes everything with `ON DELETE CASCADE` |
| `UserRead` never contains `password_hash` | The response schema decides what may leave the server |
| `/api/auth/login` sends no token and ignores 401 in the client | A wrong password must not sign out the account you are using |

## Several accounts in one browser

The browser keeps a list of `{ token, user }` and the id of the active one (`store/accounts.ts`,
saved in localStorage). Switching just changes the active id: the next request carries the other
token, and the signed-in app is keyed by the user id (with its own query cache), so it is rebuilt for that account. If the server
answers 401 (expired or revoked), that account is removed from the list automatically.

## Workspaces, roles and sharing

Every request is checked against the caller's role in the item's workspace (owner, admin,
editor, viewer) or an explicit share (editor/viewer). Viewers get `403 read_only` on any
change. Other people's items look missing (404). Invitations are single tokens (only their
SHA-256 is stored), expire after 14 days and can only be accepted by the invited email.
Deleting an account deletes the workspaces it owns; its content in other workspaces is
handed to that workspace's owner.

## Email, password reset and admin

- The SMTP password is encrypted with AES-256-GCM (key derived from `APP_SECRET_KEY`) and
  never returned by the API.
- Reset links are one-time tokens (SHA-256 stored), valid for one hour; using one signs the
  account out everywhere. "Forgot password" answers the same for unknown emails.
- Admins cannot disable, demote or delete themselves, and the last admin cannot be removed.
  Disabling an account deletes its sessions.

## Chatbot and the password vault

The server cannot read the vault, so the chatbot only knows about saved passwords when the
browser sends a short list with the question: title, type, username, site and folder of
each entry, decrypted locally while the vault is unlocked. Password values, card numbers,
secure-note text and custom fields are never sent (the request schema drops unknown
fields, which a test checks), so they can never end up in the model's input or in the
stored chat history.

## Link previews and embeds

The server fetches web pages for bookmark cards only over http(s) on ports 80/443, refuses
every address that resolves to a private, loopback or link-local IP (checked again after each
redirect), and reads at most 512 KB. Embeds use fixed provider URLs built in the browser
(e.g. `youtube-nocookie.com`) inside sandboxed iframes.

## Password vault (end-to-end encryption)

- The master password never leaves the browser. A key is derived with PBKDF2-SHA256,
  600,000 iterations and a random 16-byte salt, as a non-extractable Web Crypto key.
- Every item is encrypted with AES-256-GCM and a fresh random 12-byte IV; GCM also detects
  tampering. The server stores `base64(IV + ciphertext)` and cannot read it.
- A *verifier* (a known text encrypted with the key) lets the browser check the master
  password; the server never learns whether a guess was right.
- Changing the master password re-encrypts every item in the browser and replaces all of
  them in one database transaction.
- There is no recovery: a forgotten master password means the vault can only be reset
  (deleted) with the account password.
- The unlocked key lives only in memory and is dropped after inactivity (1–60 min), on
  reload and on account switch.

## Sessions

Each token row records the browser's user agent and when it was last used, so
Settings → Security lists signed-in devices and can sign them out one by one or all at once.

## Backups

The export contains your data as plain JSON (vault items stay encrypted) plus your uploaded
files, so keep backup files private. Import validates the archive (format marker, version,
no absolute or `..` paths, entry count and total size limits), checks every file's type
from its bytes, and runs in one transaction; on failure the stored files are removed.

## Uploaded files

- The type is detected from the file's first bytes (magic numbers), not from its name or the
  browser's `Content-Type`. Only common image and video formats are accepted; **SVG is
  rejected** because it can contain scripts.
- Size limits are checked before anything is stored (`UPLOAD_MAX_IMAGE_BYTES`, `UPLOAD_MAX_VIDEO_BYTES`); nginx caps request bodies at 600 MB.
- Downloads are served with the detected type, `X-Content-Type-Options: nosniff` and
  `Content-Disposition: inline`.
- File URLs (`/api/files/<random UUID>`) need no token so that `<img>` and `<video>` can load
  them. They are unguessable capability links: anyone who has the exact link can view the file,
  just like a shared-link service. Deleting the account removes the files.

## AI and prompt injection

Note text is sent to the model wrapped in tags and declared as data; tags inside notes are
neutralized. A note could still try to steer the model, so model output is only displayed or
inserted by the user – it never triggers actions or changes stored data on its own. The model
runs locally; no note text leaves the computer.

## Limits

- No email verification, no password reset by mail, no two-factor login.
- No rate limiting: nothing slows down someone guessing passwords. A real service needs it.
- Tokens in localStorage can be read by JavaScript on the page. User text is never injected as raw
  HTML: React escapes text, the editor renders its own schema (unknown tags are dropped), AI
  answers are rendered by a small safe renderer, and media URLs are restricted to uploaded
  files and http(s). That is the main protection against XSS. Many real products
  use httpOnly cookies instead, which JavaScript cannot read at all.
- No HTTPS: keep the app on `127.0.0.1`, as `compose.yaml` does.

## Drive files and public links

Drive accepts any file type. Files whose type is not recognized from their first bytes are
stored as `application/octet-stream` and always downloaded (never shown inline), with
`X-Content-Type-Options: nosniff` and a sandboxing Content-Security-Policy, so an uploaded
HTML or SVG file cannot run scripts in the app. Administrators can block extensions and limit
file size and space per workspace. A public link is a random 32-character token; turning it
off makes old links stop working. Sharing a folder with a person shares everything inside it.
