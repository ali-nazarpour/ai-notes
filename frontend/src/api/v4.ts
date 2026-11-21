/** Endpoints for workspaces, sharing, admin, documentation, blog, projects and AI tools. */
import type { AuthResponse, Language, Note, NoteSummary, Task, TaskInput } from "../types";
import type {
  AdminStats,
  AdminUser,
  AskAnswer,
  DocPage,
  DocPageNode,
  DocSpace,
  DocSpaceChanges,
  DocSpaceSummary,
  DocTemplate,
  EmailLogEntry,
  GeneralSettings,
  GenerateKind,
  GenerateResult,
  Invite,
  InviteCreated,
  InviteRole,
  LinkPreview,
  Member,
  Post,
  PostChanges,
  PostStatus,
  PostSummary,
  Project,
  ProjectChanges,
  ProjectKind,
  ProjectStatus,
  ProjectSummary,
  PublicBlog,
  PublicConfig,
  Revision,
  RevisionSummary,
  SearchHit,
  ShareEntry,
  SharedItem,
  ShareKind,
  ShareRole,
  SmtpSettings,
  Workspace,
  WorkspaceChanges,
} from "../types4";
import type { ColorName } from "../types";
import { request } from "./client";

const json = (method: string, body?: unknown) => ({ method, body });

export const accountApi = {
  config: () => request<PublicConfig>("/api/auth/config", { auth: false }),
  register: (
    email: string,
    password: string,
    displayName: string,
    language: Language,
    inviteToken?: string,
  ) =>
    request<AuthResponse>("/api/auth/register", {
      ...json("POST", {
        email,
        password,
        display_name: displayName,
        language,
        invite_token: inviteToken || undefined,
      }),
      auth: false,
    }),
  forgot: (email: string) =>
    request<void>("/api/auth/forgot-password", { ...json("POST", { email }), auth: false }),
  reset: (token: string, newPassword: string) =>
    request<void>("/api/auth/reset-password", {
      ...json("POST", { token, new_password: newPassword }),
      auth: false,
    }),
};

export const workspaceApi = {
  list: () => request<Workspace[]>("/api/workspaces"),
  create: (body: { name: string; icon?: string; description?: string; accent_color?: ColorName | null }) =>
    request<Workspace>("/api/workspaces", json("POST", body)),
  current: () => request<Workspace>("/api/workspaces/current"),
  update: (changes: WorkspaceChanges) =>
    request<Workspace>("/api/workspaces/current", json("PATCH", changes)),
  remove: () => request<void>("/api/workspaces/current", { method: "DELETE" }),
  members: () => request<Member[]>("/api/workspaces/current/members"),
  updateMember: (id: number, role: InviteRole) =>
    request<void>(`/api/workspaces/current/members/${id}`, json("PATCH", { role })),
  removeMember: (id: number) => request<void>(`/api/workspaces/current/members/${id}`, { method: "DELETE" }),
  invites: () => request<Invite[]>("/api/workspaces/current/invites"),
  invite: (email: string, role: InviteRole, message = "") =>
    request<InviteCreated>("/api/workspaces/current/invites", json("POST", { email, role, message })),
  revokeInvite: (id: number) => request<void>(`/api/workspaces/current/invites/${id}`, { method: "DELETE" }),
};

export const invitesApi = {
  mine: () => request<Invite[]>("/api/invites"),
  preview: (token: string) =>
    request<Invite>(`/api/invites/preview/${encodeURIComponent(token)}`, { auth: false }),
  acceptToken: (token: string) => request<Workspace>("/api/invites/accept", json("POST", { token })),
  accept: (id: number) => request<Workspace>(`/api/invites/${id}/accept`, { method: "POST" }),
  decline: (id: number) => request<void>(`/api/invites/${id}`, { method: "DELETE" }),
};

export const sharesApi = {
  list: (kind: ShareKind, itemId: number) =>
    request<ShareEntry[]>(`/api/shares?kind=${kind}&item_id=${itemId}`),
  create: (kind: ShareKind, itemId: number, email: string, role: ShareRole) =>
    request<ShareEntry>("/api/shares", json("POST", { kind, item_id: itemId, email, role })),
  update: (id: number, role: ShareRole) => request<void>(`/api/shares/${id}`, json("PATCH", { role })),
  remove: (id: number) => request<void>(`/api/shares/${id}`, { method: "DELETE" }),
  withMe: () => request<SharedItem[]>("/api/shares/with-me"),
};

export const adminApi = {
  stats: () => request<AdminStats>("/api/admin/stats"),
  users: (search = "") =>
    request<AdminUser[]>(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  updateUser: (id: number, changes: { is_admin?: boolean; is_active?: boolean }) =>
    request<void>(`/api/admin/users/${id}`, json("PATCH", changes)),
  removeUser: (id: number) => request<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
  resetLink: (id: number) =>
    request<{ link: string; email_status: "sent" | "failed" | "skipped" }>(
      `/api/admin/users/${id}/reset-link`,
      {
        method: "POST",
      },
    ),
  email: () => request<SmtpSettings>("/api/admin/settings/email"),
  saveEmail: (body: Omit<SmtpSettings, "password_set"> & { password: string | null }) =>
    request<SmtpSettings>("/api/admin/settings/email", json("PUT", body)),
  testEmail: (to: string) =>
    request<{ status: "sent" | "failed" | "skipped"; error: string }>(
      "/api/admin/settings/email/test",
      json("POST", { to }),
    ),
  general: () => request<GeneralSettings>("/api/admin/settings/general"),
  saveGeneral: (body: GeneralSettings) =>
    request<GeneralSettings>("/api/admin/settings/general", json("PUT", body)),
  emails: () => request<EmailLogEntry[]>("/api/admin/emails"),
};

export const notesExtraApi = {
  trash: () => request<NoteSummary[]>("/api/notes/trash"),
  emptyTrash: () => request<{ deleted: number }>("/api/notes/trash", { method: "DELETE" }),
  moveToTrash: (id: number) => request<void>(`/api/notes/${id}/trash`, { method: "POST" }),
  restore: (id: number) => request<Note>(`/api/notes/${id}/restore`, { method: "POST" }),
  revisions: (id: number) => request<RevisionSummary[]>(`/api/notes/${id}/revisions`),
  revision: (id: number, revisionId: number) => request<Revision>(`/api/notes/${id}/revisions/${revisionId}`),
  restoreRevision: (id: number, revisionId: number) =>
    request<Note>(`/api/notes/${id}/revisions/${revisionId}/restore`, { method: "POST" }),
};

const doc = (id: number) => `/api/docs/${id}`;

export const docsApi = {
  list: () => request<DocSpaceSummary[]>("/api/docs"),
  create: (body: {
    title: string;
    description?: string;
    icon?: string;
    color?: ColorName;
    category_id?: number | null;
    tags?: string[];
    template: DocTemplate;
  }) => request<DocSpace>("/api/docs", json("POST", body)),
  get: (id: number) => request<DocSpace>(doc(id)),
  update: (id: number, changes: DocSpaceChanges) => request<DocSpace>(doc(id), json("PATCH", changes)),
  remove: (id: number) => request<void>(doc(id), { method: "DELETE" }),
  search: (id: number, q: string) => request<SearchHit[]>(`${doc(id)}/search?q=${encodeURIComponent(q)}`),
  ask: (id: number, question: string, thorough = false) =>
    request<AskAnswer>(`${doc(id)}/ask`, json("POST", { question, thorough })),
  createPage: (
    id: number,
    body: {
      title?: string;
      parent_id?: number | null;
      index?: number;
      icon?: string;
      body?: unknown;
      content?: string;
    },
  ) => request<DocPage>(`${doc(id)}/pages`, json("POST", body)),
  createPages: (
    id: number,
    parentId: number | null,
    pages: { title: string; body?: unknown; content?: string }[],
  ) => request<DocPageNode[]>(`${doc(id)}/pages/batch`, json("POST", { parent_id: parentId, pages })),
  page: (id: number, pageId: number) => request<DocPage>(`${doc(id)}/pages/${pageId}`),
  updatePage: (
    id: number,
    pageId: number,
    changes: Partial<Pick<DocPage, "title" | "icon" | "body" | "content">>,
  ) => request<DocPage>(`${doc(id)}/pages/${pageId}`, json("PATCH", changes)),
  movePage: (id: number, pageId: number, parentId: number | null, index: number) =>
    request<void>(`${doc(id)}/pages/${pageId}/move`, json("POST", { parent_id: parentId, index })),
  duplicatePage: (id: number, pageId: number) =>
    request<DocPage>(`${doc(id)}/pages/${pageId}/duplicate`, { method: "POST" }),
  removePage: (id: number, pageId: number) =>
    request<void>(`${doc(id)}/pages/${pageId}`, { method: "DELETE" }),
  revisions: (id: number, pageId: number) =>
    request<RevisionSummary[]>(`${doc(id)}/pages/${pageId}/revisions`),
  revision: (id: number, pageId: number, revisionId: number) =>
    request<Revision>(`${doc(id)}/pages/${pageId}/revisions/${revisionId}`),
  restoreRevision: (id: number, pageId: number, revisionId: number) =>
    request<DocPage>(`${doc(id)}/pages/${pageId}/revisions/${revisionId}/restore`, { method: "POST" }),
};

export const blogApi = {
  list: (params: { status?: PostStatus; search?: string; tag?: string } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    const text = query.toString();
    return request<PostSummary[]>(`/api/blog${text ? `?${text}` : ""}`);
  },
  create: (title = "", categoryId: number | null = null) =>
    request<Post>("/api/blog", json("POST", { title, category_id: categoryId })),
  get: (id: number) => request<Post>(`/api/blog/${id}`),
  update: (id: number, changes: PostChanges) => request<Post>(`/api/blog/${id}`, json("PATCH", changes)),
  remove: (id: number) => request<void>(`/api/blog/${id}`, { method: "DELETE" }),
  revisions: (id: number) => request<RevisionSummary[]>(`/api/blog/${id}/revisions`),
  revision: (id: number, revisionId: number) => request<Revision>(`/api/blog/${id}/revisions/${revisionId}`),
  restoreRevision: (id: number, revisionId: number) =>
    request<Post>(`/api/blog/${id}/revisions/${revisionId}/restore`, { method: "POST" }),
  publicBlog: (slug: string, tag?: string) =>
    request<PublicBlog>(
      `/api/public/blog/${encodeURIComponent(slug)}${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`,
      {
        auth: false,
      },
    ),
  publicPost: (slug: string, postSlug: string) =>
    request<Post>(`/api/public/blog/${encodeURIComponent(slug)}/${encodeURIComponent(postSlug)}`, {
      auth: false,
    }),
};

export const projectsApi = {
  list: (archived = false) => request<ProjectSummary[]>(`/api/projects${archived ? "?archived=true" : ""}`),
  create: (body: {
    name: string;
    summary?: string;
    kind?: ProjectKind;
    status?: ProjectStatus;
    color?: ColorName;
    icon?: string;
    start_date?: string | null;
    end_date?: string | null;
  }) => request<Project>("/api/projects", json("POST", body)),
  get: (id: number) => request<Project>(`/api/projects/${id}`),
  update: (id: number, changes: ProjectChanges) =>
    request<Project>(`/api/projects/${id}`, json("PATCH", changes)),
  remove: (id: number) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
};

export const aiToolsApi = {
  generate: (body: {
    kind: GenerateKind;
    text?: string;
    title?: string;
    count?: number;
    language?: "auto" | Language;
  }) => request<GenerateResult>("/api/ai/generate", json("POST", body)),
  briefing: () => request<{ text: string; model: string }>("/api/ai/briefing", { method: "POST" }),
  createTasks: (tasks: TaskInput[]) => request<Task[]>("/api/tasks/batch", json("POST", { tasks })),
};

export const linkApi = {
  preview: (url: string) => request<LinkPreview>(`/api/files/preview/link?url=${encodeURIComponent(url)}`),
};
