/** One function per backend route. */
import type {
  AiStatus,
  AskNoteResponse,
  AuthResponse,
  Board,
  BoardLabel,
  BoardListData,
  BoardSummary,
  BoardTemplate,
  CardChanges,
  CardComment,
  CardDetail,
  CardSummary,
  ColorName,
  DataSummary,
  EncryptedVaultItem,
  ImportResult,
  ListSortBy,
  Session,
  VaultSetup,
  VaultStatus,
  Category,
  CategoryInput,
  Chat,
  ChatReply,
  ChatScope,
  ChatSummary,
  EditRequest,
  Language,
  Note,
  NoteChanges,
  NoteSummary,
  StoredFile,
  SummarizeResponse,
  Task,
  TaskChanges,
  TaskInput,
  TranslateResponse,
  User,
  UserChanges,
} from "../types";
import { authHeaders, request, toApiError, uploadWithProgress } from "./client";

const json = (method: string, body?: unknown) => ({ method, body });

export const authApi = {
  register: (email: string, password: string, displayName: string, language: Language) =>
    request<AuthResponse>("/api/auth/register", {
      ...json("POST", { email, password, display_name: displayName, language }),
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", { ...json("POST", { email, password }), auth: false }),
  logout: (token?: string) => request<void>("/api/auth/logout", { method: "POST", token }),
  updateMe: (changes: UserChanges) => request<User>("/api/auth/me", json("PATCH", changes)),
  changePassword: (current: string, next: string) =>
    request<void>(
      "/api/auth/change-password",
      json("POST", { current_password: current, new_password: next }),
    ),
  deleteAccount: (password: string) => request<void>("/api/auth/delete-account", json("POST", { password })),
  sessions: () => request<Session[]>("/api/auth/sessions"),
  revokeSession: (id: number) => request<void>(`/api/auth/sessions/${id}`, { method: "DELETE" }),
  revokeOtherSessions: () => request<void>("/api/auth/sessions/revoke-others", { method: "POST" }),
};

export interface NoteQuery {
  search?: string;
  favoritesOnly?: boolean;
  categoryId?: number | null;
}

export function notesQueryString(query: NoteQuery): string {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.favoritesOnly) params.set("favorite", "true");
  if (query.categoryId != null) params.set("category_id", String(query.categoryId));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const notesApi = {
  list: (query: NoteQuery = {}, signal?: AbortSignal) =>
    request<NoteSummary[]>(`/api/notes${notesQueryString(query)}`, { signal }),
  get: (id: number) => request<Note>(`/api/notes/${id}`),
  create: (data: NoteChanges = {}) => request<Note>("/api/notes", json("POST", data)),
  update: (id: number, changes: NoteChanges) => request<Note>(`/api/notes/${id}`, json("PATCH", changes)),
  remove: (id: number) => request<void>(`/api/notes/${id}`, { method: "DELETE" }),
};

export const categoriesApi = {
  list: () => request<Category[]>("/api/categories"),
  create: (input: CategoryInput) => request<Category>("/api/categories", json("POST", input)),
  update: (id: number, input: CategoryInput) =>
    request<Category>(`/api/categories/${id}`, json("PUT", input)),
  remove: (id: number) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),
};

export const tasksApi = {
  list: () => request<Task[]>("/api/tasks"),
  create: (input: TaskInput) => request<Task>("/api/tasks", json("POST", input)),
  update: (id: number, changes: TaskChanges) => request<Task>(`/api/tasks/${id}`, json("PATCH", changes)),
  remove: (id: number) => request<void>(`/api/tasks/${id}`, { method: "DELETE" }),
};

export const filesApi = {
  upload: (file: File, onProgress?: (fraction: number) => void) =>
    uploadWithProgress<StoredFile>("/api/files", file, onProgress),
};

export const aiApi = {
  status: () => request<AiStatus>("/api/ai/status"),
  summarize: (noteId: number) =>
    request<SummarizeResponse>("/api/ai/summarize", json("POST", { note_id: noteId })),
  askNote: (noteId: number, question: string, thorough: boolean) =>
    request<AskNoteResponse>("/api/ai/ask-note", json("POST", { note_id: noteId, question, thorough })),
  translate: (noteId: number, targetLanguage: string) =>
    request<TranslateResponse>(
      "/api/ai/translate",
      json("POST", { note_id: noteId, target_language: targetLanguage }),
    ),
  edit: (body: EditRequest) => request<{ result: string; model: string }>("/api/ai/edit", json("POST", body)),
};

export const chatsApi = {
  list: () => request<ChatSummary[]>("/api/chats"),
  get: (id: number) => request<Chat>(`/api/chats/${id}`),
  create: (scope: ChatScope, title = "") =>
    request<ChatSummary>("/api/chats", json("POST", { scope, title })),
  update: (id: number, changes: { title?: string; scope?: ChatScope }) =>
    request<ChatSummary>(`/api/chats/${id}`, json("PATCH", changes)),
  remove: (id: number) => request<void>(`/api/chats/${id}`, { method: "DELETE" }),
  send: (
    id: number,
    content: string,
    scope: ChatScope,
    thorough: boolean,
    vault: { title: string; type: string; username: string; url: string; folder: string }[] = [],
  ) => request<ChatReply>(`/api/chats/${id}/messages`, json("POST", { content, scope, thorough, vault })),
};

export const dataApi = {
  summary: () => request<DataSummary>("/api/data/summary"),
  /** Downloads the ZIP as a Blob (the token must be sent, so a plain link cannot be used). */
  async exportZip(): Promise<{ blob: Blob; filename: string }> {
    const base: string = import.meta.env.VITE_API_BASE_URL ?? "";
    const response = await fetch(`${base}/api/data/export`, { headers: authHeaders() });
    if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "ai-notes-backup.zip";
    return { blob: await response.blob(), filename };
  },
  importZip: (file: File, onProgress?: (fraction: number) => void) =>
    uploadWithProgress<ImportResult>("/api/data/import", file, onProgress),
};

export const vaultApi = {
  status: () => request<VaultStatus>("/api/vault"),
  setup: (body: VaultSetup) => request<VaultStatus>("/api/vault", json("POST", body)),
  rekey: (body: VaultSetup & { items: { id: number; data: string }[] }) =>
    request<VaultStatus>("/api/vault", json("PUT", body)),
  reset: (password: string) => request<void>("/api/vault/reset", json("POST", { password })),
  items: () => request<EncryptedVaultItem[]>("/api/vault/items"),
  create: (data: string) => request<EncryptedVaultItem>("/api/vault/items", json("POST", { data })),
  update: (id: number, data: string) =>
    request<EncryptedVaultItem>(`/api/vault/items/${id}`, json("PUT", { data })),
  remove: (id: number) => request<void>(`/api/vault/items/${id}`, { method: "DELETE" }),
};

const boardUrl = (id: number) => `/api/boards/${id}`;

export type BoardChanges = Partial<Pick<Board, "title" | "description" | "background" | "starred">> & {
  labels?: BoardLabel[];
};

export type ListChanges = {
  title?: string;
  color?: ColorName | null;
  wip_limit?: number | null;
  index?: number;
};

export const boardsApi = {
  list: () => request<BoardSummary[]>("/api/boards"),
  get: (id: number) => request<Board>(boardUrl(id)),
  create: (title: string, background: string, template: BoardTemplate) =>
    request<Board>("/api/boards", json("POST", { title, background, template })),
  update: (id: number, changes: BoardChanges) => request<Board>(boardUrl(id), json("PATCH", changes)),
  remove: (id: number) => request<void>(boardUrl(id), { method: "DELETE" }),
  archived: (id: number) => request<CardSummary[]>(`${boardUrl(id)}/archived`),

  createList: (boardId: number, title: string, index?: number) =>
    request<BoardListData>(`${boardUrl(boardId)}/lists`, json("POST", { title, index })),
  updateList: (boardId: number, listId: number, changes: ListChanges) =>
    request<BoardListData>(`${boardUrl(boardId)}/lists/${listId}`, json("PATCH", changes)),
  removeList: (boardId: number, listId: number) =>
    request<void>(`${boardUrl(boardId)}/lists/${listId}`, { method: "DELETE" }),
  sortList: (boardId: number, listId: number, by: ListSortBy) =>
    request<void>(`${boardUrl(boardId)}/lists/${listId}/sort`, json("POST", { by })),
  archiveListCards: (boardId: number, listId: number) =>
    request<void>(`${boardUrl(boardId)}/lists/${listId}/archive-cards`, { method: "POST" }),

  createCard: (boardId: number, listId: number, title: string, index?: number) =>
    request<CardDetail>(`${boardUrl(boardId)}/cards`, json("POST", { list_id: listId, title, index })),
  getCard: (boardId: number, cardId: number) => request<CardDetail>(`${boardUrl(boardId)}/cards/${cardId}`),
  updateCard: (boardId: number, cardId: number, changes: CardChanges) =>
    request<CardDetail>(`${boardUrl(boardId)}/cards/${cardId}`, json("PATCH", changes)),
  copyCard: (boardId: number, cardId: number) =>
    request<CardDetail>(`${boardUrl(boardId)}/cards/${cardId}/copy`, json("POST", {})),
  removeCard: (boardId: number, cardId: number) =>
    request<void>(`${boardUrl(boardId)}/cards/${cardId}`, { method: "DELETE" }),
  addComment: (boardId: number, cardId: number, text: string) =>
    request<CardComment>(`${boardUrl(boardId)}/cards/${cardId}/comments`, json("POST", { text })),
  removeComment: (boardId: number, cardId: number, commentId: number) =>
    request<void>(`${boardUrl(boardId)}/cards/${cardId}/comments/${commentId}`, { method: "DELETE" }),
};
