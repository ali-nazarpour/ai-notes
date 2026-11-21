/** API data shapes. They mirror the Pydantic schemas in backend/app/schemas. */
import type { JSONContent } from "@tiptap/react";

export type ColorName =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "rose"
  | "brown"
  | "slate"
  | "graphite";

export type Theme = "system" | "light" | "dark";
export type Language = "en" | "fa";

export interface User {
  id: number;
  email: string;
  display_name: string;
  theme: Theme;
  accent_color: ColorName;
  language: Language;
  first_name: string;
  last_name: string;
  /** "YYYY-MM-DD" (Gregorian) or null. */
  birth_date: string | null;
  phone: string;
  address: string;
  bio: string;
  /** "/api/files/<uuid>" of a square image, or null. */
  avatar: string | null;
  is_admin: boolean;
  email_notifications: boolean;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type UserChanges = Partial<
  Pick<
    User,
    | "display_name"
    | "theme"
    | "accent_color"
    | "language"
    | "email"
    | "first_name"
    | "last_name"
    | "birth_date"
    | "phone"
    | "address"
    | "bio"
    | "avatar"
    | "email_notifications"
  >
> & { current_password?: string };

export interface Session {
  id: number;
  user_agent: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  current: boolean;
}

export interface SavedAccount {
  token: string;
  user: User;
}

export interface Category {
  id: number;
  name: string;
  color: ColorName;
  icon: string;
  note_count: number;
  open_task_count: number;
  created_at: string;
}

export interface CategoryInput {
  name: string;
  color: ColorName;
  icon: string;
}

export interface NoteSummary {
  id: number;
  title: string;
  excerpt: string;
  cover: string | null;
  category_id: number | null;
  is_favorite: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type FontStyle = "default" | "serif" | "mono";

export interface NoteSettings {
  font: FontStyle;
  small_text: boolean;
  full_width: boolean;
  toc: boolean;
  locked: boolean;
}

export type Role = "owner" | "admin" | "editor" | "viewer";

export interface Note extends NoteSummary {
  content: string;
  body: JSONContent | null;
  settings: NoteSettings;
  workspace_id: number | null;
  role: Role;
  shared: boolean;
  updated_by_name: string;
}

export type NoteChanges = Partial<
  Pick<Note, "title" | "content" | "body" | "category_id" | "cover" | "is_favorite">
> & { settings?: NoteSettings; workspace_id?: number };

export interface Task {
  id: number;
  title: string;
  is_done: boolean;
  /** Plain calendar date "YYYY-MM-DD" (Gregorian, no time zone), or null. */
  due_date: string | null;
  category_id: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface TaskInput {
  title: string;
  due_date: string | null;
  category_id: number | null;
}

export type TaskChanges = Partial<Pick<Task, "title" | "is_done" | "due_date" | "category_id">>;

export interface StoredFile {
  id: string;
  url: string;
  kind: "image" | "video" | "audio" | "file";
  content_type: string;
  size: number;
  original_name: string;
  created_at: string;
}

export interface AiStatus {
  ollama_reachable: boolean;
  model: string;
  model_available: boolean;
  detail: string;
}

export interface SummarizeResponse {
  note_id: number;
  summary: string;
  model: string;
  chunks: number;
}

export interface AskNoteResponse {
  note_id: number;
  answer: string;
  model: string;
  partial: boolean;
}

export interface TranslateResponse {
  note_id: number;
  target_language: string;
  language_name: string;
  translation: string;
  model: string;
}

export type EditAction =
  | "improve"
  | "fix"
  | "shorter"
  | "longer"
  | "simplify"
  | "professional"
  | "friendly"
  | "translate"
  | "continue"
  | "custom";

export interface EditRequest {
  action: EditAction;
  text: string;
  instruction?: string;
  target_language?: string;
  context?: string;
}

export type ChatSourceKind =
  "notes" | "docs" | "blog" | "projects" | "boards" | "tasks" | "slides" | "drive" | "learn" | "passwords";

export interface ChatScope {
  category_ids: number[] | null;
  include_uncategorized: boolean;
  sources?: ChatSourceKind[];
}

export interface ChatSummary {
  id: number;
  title: string;
  scope: ChatScope;
  created_at: string;
  updated_at: string;
}

export interface ChatSource {
  id: number;
  title: string;
  kind?: string;
  url?: string | null;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  cited_note_ids: number[];
  partial: boolean;
  created_at: string;
}

export interface Chat extends ChatSummary {
  messages: ChatMessage[];
}

export interface ChatReply {
  conversation: ChatSummary;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export type ViewMode = "grid" | "list";

// --- Data backup ---

export interface DataSummary {
  notes: number;
  tasks: number;
  categories: number;
  boards: number;
  docs?: number;
  posts?: number;
  projects?: number;
  files: number;
  chats: number;
  vault_items: number;
}

export interface ImportResult {
  categories: number;
  notes: number;
  tasks: number;
  chats: number;
  boards: number;
  cards: number;
  docs?: number;
  doc_pages?: number;
  posts?: number;
  projects?: number;
  files: number;
  vault_items: number;
  vault_skipped: boolean;
  warnings: string[];
}

// --- Password vault (the server only sees ciphertext; see lib/vaultCrypto.ts) ---

export interface VaultStatus {
  configured: boolean;
  kdf: string | null;
  iterations: number | null;
  salt: string | null;
  verifier: string | null;
  item_count: number;
}

export interface VaultSetup {
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  verifier: string;
}

export interface EncryptedVaultItem {
  id: number;
  data: string;
  created_at: string;
  updated_at: string;
}

export type VaultEntryType = "login" | "card" | "note" | "wifi";

/** What is inside an item after decryption. */
export interface VaultEntry {
  type: VaultEntryType;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  folder: string;
  favorite: boolean;
  /** Optional project the entry belongs to (kept inside the encrypted data). */
  project_id?: number | null;
  /** Card: number / expiry / holder / cvv. */
  extra: Record<string, string>;
  /** ISO timestamp of the last password change (for "old password" hints). */
  password_changed_at: string;
}

export interface VaultRecord extends VaultEntry {
  id: number;
  created_at: string;
  updated_at: string;
}

// --- Boards ---

export interface BoardLabel {
  id: string;
  name: string;
  color: ColorName;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface CardAttachment {
  id: string;
  name: string;
  kind: "image" | "video" | "audio" | "file";
  url: string;
}

export interface CardSummary {
  id: number;
  list_id: number;
  title: string;
  position: number;
  label_ids: string[];
  start_date: string | null;
  due_date: string | null;
  due_done: boolean;
  cover: string | null;
  archived: boolean;
  has_description: boolean;
  checklist_done: number;
  checklist_total: number;
  comment_count: number;
  attachment_count: number;
  created_at: string;
  updated_at: string;
}

export interface CardComment {
  id: number;
  text: string;
  created_at: string;
}

export interface CardDetail extends CardSummary {
  description: JSONContent | null;
  description_text: string;
  checklists: Checklist[];
  attachments: CardAttachment[];
  comments: CardComment[];
}

export type CardChanges = Partial<
  Pick<
    CardDetail,
    | "title"
    | "description"
    | "description_text"
    | "label_ids"
    | "start_date"
    | "due_date"
    | "due_done"
    | "cover"
    | "checklists"
    | "attachments"
    | "archived"
  >
> & { list_id?: number; index?: number };

export interface BoardListData {
  id: number;
  title: string;
  position: number;
  color: ColorName | null;
  wip_limit: number | null;
  cards: CardSummary[];
}

export interface BoardSummary {
  id: number;
  title: string;
  description: string;
  background: string;
  starred: boolean;
  list_count: number;
  card_count: number;
  created_at: string;
  updated_at: string;
}

export interface Board extends BoardSummary {
  labels: BoardLabel[];
  lists: BoardListData[];
}

export type BoardTemplate = "blank" | "kanban" | "project" | "weekly" | "personal";
export type ListSortBy = "due" | "title" | "newest" | "oldest";
