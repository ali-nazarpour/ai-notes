/** Endpoints for the drive, presentations, language learning and the global search. */
import type {
  Alarm,
  CalendarEvent,
  DriveSection,
  LinkedItem,
  LinkKind,
  AlarmInput,
  CardFields,
  Deck,
  DeckChanges,
  DeckSummary,
  DriveFolder,
  DriveItem,
  DriveListing,
  DriveSettings,
  DriveUsage,
  DriveView,
  LangCard,
  LangCode,
  LangDeck,
  LangStats,
  PublicDrive,
  SearchResult,
  Slide,
  SlideTheme,
  Song,
  SongChanges,
  StudyQueue,
} from "../types5";
import { ApiError, authHeaders, request, toApiError } from "./client";

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";
const json = (method: string, body?: unknown) => ({ method, body });
const tz = () => -new Date().getTimezoneOffset();

export const searchApi = {
  all: (q: string, perKind = 6, signal?: AbortSignal) =>
    request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}&per_kind=${perKind}`, { signal }),
};

/** Upload to the drive with progress; `relativePath` keeps the folders of a dropped folder. */
export function driveUpload(
  file: File,
  parentId: number | null,
  relativePath: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
  section: DriveSection = "files",
): Promise<DriveItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/api/drive/upload`);
    for (const [name, value] of Object.entries(authHeaders())) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, "Cannot reach the server.", "network"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as DriveItem);
      else reject(toApiError(xhr.status, body));
    };
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    if (parentId != null) form.append("parent_id", String(parentId));
    if (relativePath) form.append("relative_path", relativePath);
    form.append("section", section);
    xhr.send(form);
  });
}

/** Downloads a response that needs the Authorization header (e.g. a folder ZIP). */
export async function downloadAuthed(path: string, filename: string): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
  if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const driveApi = {
  list: (view: DriveView, folder: number | null, q = "", section: DriveSection = "files") => {
    const params = new URLSearchParams({ view, section });
    if (folder != null) params.set("folder", String(folder));
    if (q) params.set("q", q);
    return request<DriveListing>(`/api/drive?${params}`);
  },
  usage: () => request<DriveUsage>("/api/drive/usage"),
  folders: (section: DriveSection = "files") =>
    request<DriveFolder[]>(`/api/drive/folders?section=${section}`),
  item: (id: number) => request<DriveItem>(`/api/drive/items/${id}`),
  createFolder: (
    name: string,
    parentId: number | null,
    color: string | null = null,
    section: DriveSection = "files",
  ) => request<DriveItem>("/api/drive/folders", json("POST", { name, parent_id: parentId, color, section })),
  update: (
    id: number,
    changes: Partial<Pick<DriveItem, "name" | "starred" | "color" | "description" | "parent_id">>,
  ) => request<DriveItem>(`/api/drive/items/${id}`, json("PATCH", changes)),
  trash: (id: number) => request<void>(`/api/drive/items/${id}/trash`, { method: "POST" }),
  restore: (id: number) => request<DriveItem>(`/api/drive/items/${id}/restore`, { method: "POST" }),
  remove: (id: number) => request<void>(`/api/drive/items/${id}`, { method: "DELETE" }),
  emptyTrash: () => request<void>("/api/drive/trash", { method: "DELETE" }),
  link: (id: number) => request<{ token: string | null }>(`/api/drive/items/${id}/link`),
  setLink: (id: number, enabled: boolean) =>
    request<{ token: string | null }>(`/api/drive/items/${id}/link`, json("PUT", { enabled })),
  zip: (id: number, name: string) => downloadAuthed(`/api/drive/items/${id}/zip`, `${name}.zip`),
  publicView: (token: string, folder: number | null) =>
    request<PublicDrive>(
      `/api/public/drive/${encodeURIComponent(token)}${folder != null ? `?folder=${folder}` : ""}`,
      { auth: false },
    ),
  publicZipUrl: (token: string, folder: number | null) =>
    `${BASE_URL}/api/public/drive/${encodeURIComponent(token)}/zip${folder != null ? `?folder=${folder}` : ""}`,
  settings: () => request<DriveSettings>("/api/admin/settings/drive"),
  saveSettings: (value: DriveSettings) =>
    request<DriveSettings>("/api/admin/settings/drive", json("PUT", value)),
};

export const slidesApi = {
  list: () => request<DeckSummary[]>("/api/slides"),
  create: (body: { title?: string; theme?: SlideTheme; slides?: Slide[]; category_id?: number | null }) =>
    request<Deck>("/api/slides", json("POST", body)),
  get: (id: number) => request<Deck>(`/api/slides/${id}`),
  update: (id: number, changes: DeckChanges) => request<Deck>(`/api/slides/${id}`, json("PATCH", changes)),
  duplicate: (id: number) => request<Deck>(`/api/slides/${id}/duplicate`, { method: "POST" }),
  remove: (id: number) => request<void>(`/api/slides/${id}`, { method: "DELETE" }),
  ai: (body: { topic: string; text?: string; count: number; language?: "auto" | "en" | "fa" }) =>
    request<{ title: string; slides: Slide[]; model: string }>("/api/slides/ai", json("POST", body)),
};

export const learnApi = {
  decks: () => request<LangDeck[]>("/api/learn/decks"),
  deck: (id: number) => request<LangDeck>(`/api/learn/decks/${id}`),
  createDeck: (body: Partial<LangDeck> & { name: string }) =>
    request<LangDeck>("/api/learn/decks", json("POST", body)),
  updateDeck: (id: number, changes: Partial<LangDeck>) =>
    request<LangDeck>(`/api/learn/decks/${id}`, json("PATCH", changes)),
  removeDeck: (id: number) => request<void>(`/api/learn/decks/${id}`, { method: "DELETE" }),
  cards: (deckId: number) => request<LangCard[]>(`/api/learn/decks/${deckId}/cards`),
  addCard: (deckId: number, card: Partial<CardFields> & { front: string }) =>
    request<LangCard>(`/api/learn/decks/${deckId}/cards`, json("POST", card)),
  addCards: (deckId: number, cards: (Partial<CardFields> & { front: string })[]) =>
    request<LangCard[]>(`/api/learn/decks/${deckId}/cards/bulk`, json("POST", { cards })),
  updateCard: (id: number, changes: Partial<CardFields> & { starred?: boolean; deck_id?: number }) =>
    request<LangCard>(`/api/learn/cards/${id}`, json("PATCH", changes)),
  resetCard: (id: number) => request<LangCard>(`/api/learn/cards/${id}/reset`, { method: "POST" }),
  removeCard: (id: number) => request<void>(`/api/learn/cards/${id}`, { method: "DELETE" }),
  study: (deck: number | null, mode: "due" | "all" | "starred" = "due", limit = 100) => {
    const params = new URLSearchParams({ tz: String(tz()), mode, limit: String(limit) });
    if (deck != null) params.set("deck", String(deck));
    return request<StudyQueue>(`/api/learn/study?${params}`);
  },
  review: (id: number, grade: number) =>
    request<LangCard>(`/api/learn/cards/${id}/review`, json("POST", { grade })),
  stats: () => request<LangStats>(`/api/learn/stats?tz=${tz()}`),
  songs: () => request<Song[]>("/api/learn/songs"),
  song: (id: number) => request<Song>(`/api/learn/songs/${id}`),
  createSong: (body: SongChanges & { title: string }) =>
    request<Song>("/api/learn/songs", json("POST", body)),
  updateSong: (id: number, changes: SongChanges) =>
    request<Song>(`/api/learn/songs/${id}`, json("PATCH", changes)),
  removeSong: (id: number) => request<void>(`/api/learn/songs/${id}`, { method: "DELETE" }),
  aiCards: (body: {
    topic?: string;
    words?: string;
    count?: number;
    level?: "beginner" | "intermediate" | "advanced";
    source_lang: LangCode;
    target_lang: LangCode;
  }) => request<{ cards: CardFields[]; model: string }>("/api/learn/ai/cards", json("POST", body)),
  explain: (body: { word: string; context?: string; source_lang: LangCode; target_lang: LangCode }) =>
    request<{ card: CardFields; explanation: string; model: string }>(
      "/api/learn/ai/explain",
      json("POST", body),
    ),
  translateLines: (body: { lines: string[]; source_lang: LangCode; target_lang: LangCode; title?: string }) =>
    request<{ translations: string[]; model: string }>("/api/learn/ai/translate-lines", json("POST", body)),
};

export const alarmsApi = {
  list: () => request<Alarm[]>("/api/alarms"),
  create: (body: AlarmInput) => request<Alarm>("/api/alarms", json("POST", body)),
  update: (id: number, changes: Partial<AlarmInput>) =>
    request<Alarm>(`/api/alarms/${id}`, json("PATCH", changes)),
  remove: (id: number) => request<void>(`/api/alarms/${id}`, { method: "DELETE" }),
  fired: (id: number, at: Date) =>
    request<Alarm>(`/api/alarms/${id}/fired`, json("POST", { at: at.toISOString() })),
  snooze: (id: number, minutes: number) =>
    request<Alarm>(`/api/alarms/${id}/snooze`, json("POST", { minutes })),
};

export const calendarApi = {
  events: (start: string, end: string) =>
    request<CalendarEvent[]>(`/api/calendar/events?start=${start}&end=${end}`),
};

export const projectLinksApi = {
  links: (projectId: number) => request<Record<LinkKind, LinkedItem[]>>(`/api/projects/${projectId}/links`),
  link: (projectId: number, kind: LinkKind, itemId: number) =>
    request<LinkedItem>(`/api/projects/${projectId}/links`, json("POST", { kind, item_id: itemId })),
  unlink: (projectId: number, kind: LinkKind, itemId: number) =>
    request<void>(`/api/projects/${projectId}/links/${kind}/${itemId}`, { method: "DELETE" }),
  options: (projectId: number, kind: LinkKind, q = "") =>
    request<LinkedItem[]>(`/api/projects/${projectId}/link-options?kind=${kind}&q=${encodeURIComponent(q)}`),
  driveFolder: (projectId: number) =>
    request<LinkedItem>(`/api/projects/${projectId}/drive-folder`, { method: "POST" }),
};
