/** Shapes for workspaces, sharing, admin, documentation, blog, projects and AI tools. */
import type { JSONContent } from "@tiptap/react";

import type { ColorName, FontStyle, Role, Theme } from "./types";

// --- Workspaces ---

export interface WorkspaceSettings {
  blog_public: boolean;
  ai_enabled: boolean;
  default_font: FontStyle;
  full_width: boolean;
  week_start: "auto" | "saturday" | "sunday" | "monday";
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  icon: string;
  description: string;
  accent_color: ColorName | null;
  theme: Theme | null;
  cover: string | null;
  settings: WorkspaceSettings;
  owner_id: number;
  role: Role;
  member_count: number;
  created_at: string;
}

export type WorkspaceChanges = Partial<
  Pick<Workspace, "name" | "icon" | "description" | "accent_color" | "theme" | "cover">
> & { settings?: Partial<WorkspaceSettings> };

export interface Member {
  id: number;
  user_id: number;
  email: string;
  name: string;
  avatar: string | null;
  role: Role;
  joined_at: string;
}

export type InviteRole = "admin" | "editor" | "viewer";

export interface Invite {
  id: number;
  workspace_id: number;
  workspace_name: string;
  workspace_icon: string;
  email: string;
  role: InviteRole;
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export interface InviteCreated extends Invite {
  link: string;
  email_status: "sent" | "failed" | "skipped";
}

export type ShareKind = "note" | "board" | "doc" | "project" | "drive" | "deck";
export type ShareRole = "editor" | "viewer";

export interface ShareEntry {
  id: number;
  kind: ShareKind;
  item_id: number;
  user_id: number;
  email: string;
  name: string;
  avatar: string | null;
  role: ShareRole;
  created_at: string;
}

export interface SharedItem {
  share_id: number;
  kind: ShareKind;
  item_id: number;
  title: string;
  role: ShareRole;
  workspace_id: number;
  workspace_name: string;
  shared_by: string;
  url: string;
  created_at: string;
}

// --- Admin ---

export interface PublicConfig {
  app_name: string;
  allow_registration: boolean;
  email_enabled: boolean;
}

export interface AdminStats {
  users: number;
  active_users_7d: number;
  admins: number;
  disabled: number;
  workspaces: number;
  notes: number;
  tasks: number;
  boards: number;
  doc_pages: number;
  posts: number;
  projects: number;
  files: number;
  storage_bytes: number;
  drive_files?: number;
  drive_bytes?: number;
  decks?: number;
  flashcards?: number;
  emails_sent: number;
  emails_failed: number;
  email_enabled: boolean;
  ai_reachable: boolean;
  ai_model: string;
  ai_model_available: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  avatar: string | null;
  language: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_active: string | null;
  workspaces: number;
  notes: number;
  storage_bytes: number;
}

export type SmtpSecurity = "starttls" | "ssl" | "none";

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  from_email: string;
  from_name: string;
  password_set: boolean;
}

export interface GeneralSettings {
  app_name: string;
  app_url: string;
  allow_registration: boolean;
}

export interface EmailLogEntry {
  id: number;
  to_email: string;
  subject: string;
  kind: string;
  status: "sent" | "failed" | "skipped";
  error: string;
  created_at: string;
}

// --- Version history ---

export interface RevisionSummary {
  id: number;
  title: string;
  chars: number;
  excerpt: string;
  created_at: string;
  user_name: string;
}

export interface Revision {
  id: number;
  title: string;
  body: JSONContent | null;
  content: string;
  created_at: string;
}

// --- Documentation ---

export type DocTemplate = "blank" | "guide" | "api" | "handbook";

export interface DocSpaceSummary {
  id: number;
  title: string;
  description: string;
  icon: string;
  color: ColorName;
  cover: string | null;
  category_id: number | null;
  tags: string[];
  version: string;
  starred: boolean;
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocPageNode {
  id: number;
  parent_id: number | null;
  title: string;
  icon: string;
  position: number;
  updated_at: string;
}

export interface DocSpace extends DocSpaceSummary {
  pages: DocPageNode[];
  role: Role;
  shared: boolean;
}

export interface DocPage extends DocPageNode {
  space_id: number;
  body: JSONContent | null;
  content: string;
  created_at: string;
  updated_by_name: string;
}

export type DocSpaceChanges = Partial<
  Pick<
    DocSpaceSummary,
    "title" | "description" | "icon" | "color" | "cover" | "category_id" | "tags" | "version" | "starred"
  >
>;

export interface SearchHit {
  id: number;
  title: string;
  snippet: string;
}

export interface AskAnswer {
  answer: string;
  sources: { id: number; title: string; url: string }[];
  cited_ids: number[];
  partial: boolean;
  model: string;
}

// --- Blog ---

export type PostStatus = "draft" | "published";

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  cover: string | null;
  tags: string[];
  category_id: number | null;
  status: PostStatus;
  published_at: string | null;
  featured: boolean;
  views: number;
  reading_minutes: number;
  author_name: string;
  author_avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface Post extends PostSummary {
  body: JSONContent | null;
  content: string;
  seo_title: string;
  seo_description: string;
}

export type PostChanges = Partial<
  Pick<
    Post,
    | "title"
    | "slug"
    | "excerpt"
    | "body"
    | "content"
    | "cover"
    | "tags"
    | "category_id"
    | "status"
    | "published_at"
    | "seo_title"
    | "seo_description"
    | "featured"
  >
>;

export interface PublicBlog {
  workspace_name: string;
  workspace_icon: string;
  description: string;
  posts: PostSummary[];
}

// --- Projects ---

export type ProjectStatus = "idea" | "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ProjectKind = "software" | "design" | "marketing" | "research" | "event" | "business" | "general";

export interface Milestone {
  id: string;
  title: string;
  date: string | null;
  done: boolean;
}

export interface Expense {
  id: string;
  title: string;
  amount: number | string;
  date: string | null;
  category: string;
}

export interface ProjectMember {
  id: string;
  name: string;
  role: string;
  email: string;
  user_id: number | null;
}

export interface Repository {
  id: string;
  url: string;
  name: string;
  branch: string;
  provider: string;
}

export interface ProjectLink {
  id: string;
  url: string;
  title: string;
  kind: string;
}

export interface ProjectFile {
  id: string;
  url: string;
  name: string;
  size: number;
  content_type: string;
  folder: string;
  uploaded_at: string | null;
}

export interface ProjectNote {
  id: string;
  text: string;
  color: string;
  pinned: boolean;
}

export interface ProjectSummary {
  id: number;
  name: string;
  summary: string;
  status: ProjectStatus;
  priority: Priority;
  kind: ProjectKind;
  color: ColorName;
  icon: string;
  cover: string | null;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  budget: string | number | null;
  spent: string | number;
  currency: string;
  client: string;
  category_id: number | null;
  tags: string[];
  member_count: number;
  milestone_count: number;
  milestones_done: number;
  starred: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project extends ProjectSummary {
  description: JSONContent | null;
  description_text: string;
  manual_progress: number | null;
  board_id: number | null;
  doc_space_id: number | null;
  members: ProjectMember[];
  milestones: Milestone[];
  expenses: Expense[];
  repositories: Repository[];
  links: ProjectLink[];
  files: ProjectFile[];
  notes: ProjectNote[];
  role: Role;
  shared: boolean;
}

export type ProjectChanges = Partial<
  Omit<
    Project,
    | "id"
    | "progress"
    | "spent"
    | "member_count"
    | "milestone_count"
    | "milestones_done"
    | "created_at"
    | "updated_at"
    | "role"
    | "shared"
    | "manual_progress"
  >
> & { progress?: number | null };

// --- AI tools ---

export type GenerateKind =
  | "tasks"
  | "checklist"
  | "cards"
  | "outline"
  | "doc_pages"
  | "titles"
  | "tags"
  | "milestones"
  | "risks"
  | "excerpt"
  | "seo"
  | "project_brief"
  | "status_report"
  | "write"
  | "improve_title";

export interface GeneratedItem {
  title: string;
  detail: string;
  date: string | null;
}

export interface GenerateResult {
  kind: GenerateKind;
  text: string;
  items: GeneratedItem[];
  model: string;
}

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  site_name: string;
  favicon: string | null;
}
