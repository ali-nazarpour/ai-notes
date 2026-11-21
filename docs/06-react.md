# 6. Frontend, editor, i18n and PWA

## Data

TanStack Query caches server data per account (`api/queries.ts`). Tasks and favorites update
optimistically and roll back on error (with an *Undo* toast for deletions). Notes autosave:
edits are debounced into one `PATCH`, and pending changes are flushed when the page is hidden,
closed, or the note is left. A new note that is still empty when left is deleted.

## Editor

TipTap 3 (ProseMirror) in `features/editor/`:

| File | Purpose |
|---|---|
| `NoteEditor.tsx` | Extensions, paste/drop upload with progress, word count |
| `SlashCommand.tsx`, `slashItems.ts` | `/` menu with keyboard navigation and filtering (matches English and Persian names) |
| `Toolbars.tsx` | Selection bubble (marks, link, alignment, block type, AI actions) and table toolbar |
| `Media.tsx` | `media` node for images and videos: align left/center/right, width 33/50/75/100%. Left/right float so text wraps (stacked on phones) |
| `AiDialog.tsx` | AI edit / continue / write with preview; result is converted from Markdown to editor nodes |

The note is stored twice: `body` (editor JSON, the source of truth) and `content` (plain text
for search, excerpts and AI). Every block gets its own direction (`BlockDirection.ts`), so
English and Persian text can be mixed in one note. Media URLs are restricted to uploaded files and http(s).

## Workspaces

`store/workspace.ts` keeps the selected workspace per account; the API client sends it as
`X-Workspace-Id`. `App.tsx` mounts the routes keyed by account + workspace with a fresh
query cache, so switching never mixes data. `WorkspaceProvider` loads the current
workspace; its theme/accent override the user's own (`workspaceLook`).

## Dates

`components/DatePicker.tsx`: `MonthGrid` (click the title for a month list, then a year
list), `DatePicker` (a chip with quick choices) and `DateInput` (a form field, used for the
birth date). All show the Jalali calendar in Persian and store Gregorian ISO dates.

## Editor blocks and page menu

`features/editor/Blocks.tsx` adds embed, audio, bookmark, file, callout, toggle, table of
contents and page-link nodes. Embeds are rebuilt from the original link by `lib/embeds.ts`
for known providers only (the iframe URL is never taken from stored HTML). Pasting a single
link to a known provider or to an image/video/audio file inserts the block.
`components/PageMenu.tsx` is the shared "⋯" menu (notes, documentation pages, posts);
`lib/exporters.ts` converts editor JSON to Markdown/HTML and prints via a sandboxed iframe.

## Boards

`features/boards/` uses dnd-kit: a sortable context for the lists (horizontal) and one per
list for its cards. While a card is dragged over another list, a local copy of the board is
updated so the card visibly moves; on drop the React Query cache is updated immediately
and one PATCH (`list_id` + `index`) is sent (on failure the board reloads). Pointer (6 px
threshold, so clicks still open cards), touch (long press) and keyboard (Space + arrows)
sensors are enabled; dragging is paused while a filter hides cards. A card opens in a modal
addressed by `?card=<id>`, so it can be linked. Descriptions reuse the note editor.

## Password manager

`features/vault/` + `lib/vaultCrypto.ts`. The key is derived with PBKDF2-SHA256 (600,000
iterations) and kept only in memory (`store/vaultSession.ts`); it is dropped after the
chosen inactivity time, on reload and when switching accounts. Copying a secret clears the
clipboard after 30 s if it still holds that secret.

## Global search

There is one search box, in the top bar (`layout/GlobalSearch.tsx`). It opens a search
window (click, Ctrl/⌘+K or `/`): results from every section (`GET /api/search`, ranked on
the server, the best section first), app pages and actions, recent searches, and saved
password names while the vault is unlocked (decrypted in the browser by
`features/vault/vaultHints.ts`). On list pages (`hooks/usePageQuery.ts` lists them) the first
result filters the page through `?q=`, and pages filter themselves with `usePageQuery()` +
`matchesQuery()`. Pages never render their own search inputs.

## Alarms

`features/alarms`: the server only stores alarms; `schedule.ts` works out in the browser's
local time when each one rings (once, daily, working days, weekly days, monthly in the
user's calendar), `AlarmCenter` (mounted in the app shell) checks every 5 seconds, records
the ring (`POST /api/alarms/{id}/fired`, so several tabs ring once), plays a Web Audio sound
(`sounds.ts`) until dismissed or snoozed and shows a system notification when the tab is
hidden. Alarms cannot ring while no tab of the app is open.

## Drive

`features/drive`: `DrivePage` (views, grid/list, selection, drag & drop, context menu),
`useUploads` (two parallel uploads with progress and cancel; dropped folders are walked with
the File System Entry API and sent with their `relative_path`), `DrivePreview` (PDF and text
are fetched as blobs, so they can be shown although the server sends them as downloads),
`DriveDialogs` (new folder, rename, move tree, details, public link) and `PublicDrivePage`
for `/d/:token`.

## Presentations

`features/slides`: a slide is plain data (`types5.ts`); `SlideView` draws it in a 16:9 frame
sized in container units (`styles/slides.css`), so thumbnails, the editor, the presenter and
exports look the same. A slide takes the direction of its own text. `exportDeck.ts` prints
to PDF, writes `.pptx` with pptxgenjs (loaded on demand) and builds a standalone HTML player
with images and music embedded as data URLs.

## Language learning

`features/learn`: dashboard (stats, heatmap), deck page (cards, AI cards, import), study
modes (`StudyPage`: flashcards with spaced repetition, type, quiz, listen — text-to-speech
uses the browser's `speechSynthesis`) and the song player (`SongPage` +
`useSongPlayer`, which wraps an HTML media element or the YouTube IFrame API and polls the
current time for synced lyrics; LRC import and tap-to-sync set the times).

## Internationalization

- `i18n/en.ts` is the source of truth; `fa.ts` is typed as `Record<TranslationKey, string>`,
  so a missing Persian string is a type error. A test also checks that placeholders match.
- Plurals use `.one` / `.other` keys (`plural("tasks.count", n)`).
- The provider sets `<html lang dir>`; layouts use CSS logical properties (`margin-inline`,
  `inset-inline-start`, …) so they mirror automatically. Directional icons get `flip-rtl`.
- Text direction: inputs and textareas use `unicode-bidi: plaintext` (each line follows its
  first letter; an empty field follows the page). In the editor, `BlockDirection` stores
  `dir="rtl|ltr"` on every block from its first letter and leaves empty blocks without it,
  so empty lines and placeholders sit on the page's side.
- `index.html` applies the saved language, direction, theme and accent before React starts
  (no flash).
- Dates: `lib/calendar.ts` exposes one API for both calendars. Persian uses the Jalali
  calendar (via `jalaali-js`) with fixed month/weekday tables, Saturday as first weekday and
  Persian digits. Stored dates are always Gregorian ISO strings.
- Backend errors are translated by their `code` (`i18n/errors.ts`).

## Layout

Mobile first: bottom navigation and a floating *+* button under 900 px; a collapsible sidebar
above. The dashboard uses a two-column grid whose cards stretch to equal height with
internal scrolling; settings uses a section list + a single panel (a horizontal chip bar on
phones).

## PWA

`vite-plugin-pwa` generates the manifest and a Workbox service worker:

- precaches the app shell; navigation falls back to `index.html` (except `/api/`);
- uploaded images are cached (cache-first, they never change);
- `registerType: "prompt"` – when a new version is deployed, a banner offers *Reload*;
- manifest: standalone display, maskable icons, shortcuts (new note, new task, Ask AI);
- *Settings → Install app* uses `beforeinstallprompt` where supported.

Icons are generated from `public/favicon.svg` with `npm run icons`
(`pwa-assets.config.ts`).

## Tooling

TypeScript 7 (`tsc --noEmit`), oxlint, Prettier, Vitest + Testing Library. The editor page
and chat page are lazy-loaded to keep the first load small.
