/**
 * A tiny in-memory fake of the backend for page tests: routes are matched by method and
 * path, and every request is recorded so tests can assert what the UI sent.
 */
import { vi } from "vitest";

import { accountStore } from "../store/accounts";
import type { Category, NoteSummary, Task, User } from "../types";

type Handler = (body: unknown, url: URL) => unknown;

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

export const USER: User = {
  id: 1,
  email: "sara@example.com",
  display_name: "Sara",
  theme: "light",
  accent_color: "indigo",
  language: "en",
  first_name: "",
  last_name: "",
  birth_date: null,
  phone: "",
  address: "",
  bio: "",
  avatar: null,
  is_admin: false,
  email_notifications: true,
  created_at: "2026-01-01T10:00:00Z",
};

export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: "Work",
    color: "blue",
    icon: "💼",
    note_count: 0,
    open_task_count: 0,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

export function noteSummary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: 1,
    title: "Meeting notes",
    excerpt: "We agreed on the plan",
    cover: null,
    category_id: null,
    is_favorite: false,
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    ...overrides,
  };
}

export function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "Buy milk",
    is_done: false,
    due_date: null,
    category_id: null,
    created_at: "2026-11-10T10:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

/** Installs a fetch mock. Unknown routes answer 404 so missing mocks are visible. */
export function mockServer(routes: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  const defaults: Record<string, Handler> = {
    "GET /api/categories": () => [],
    "GET /api/tasks": () => [],
    "GET /api/notes": () => [],
    "GET /api/chats": () => [],
    "GET /api/ai/status": () => ({
      ollama_reachable: true,
      model: "qwen3.5:4b",
      model_available: true,
      detail: "",
    }),
  };
  const table = { ...defaults, ...routes };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, body });

    // An exact route wins over a pattern route ("/api/chats/:id").
    const matches = (key: string) => {
      const [m, path] = key.split(" ");
      return m === method && new RegExp(`^${path.replace(/:\w+/g, "[^/]+")}$`).test(url.pathname);
    };
    const key = `${method} ${url.pathname}`;
    const handler: Handler | undefined =
      key in table ? table[key] : Object.entries(table).find(([route]) => matches(route))?.[1];
    if (!handler) {
      return new Response(JSON.stringify({ detail: "Not found", code: "not_found" }), { status: 404 });
    }
    const result = handler(body, url);
    if (result instanceof Response) return result;
    if (result === undefined) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export function signIn(user: Partial<User> = {}): User {
  const full = { ...USER, ...user };
  accountStore.signIn({ token: "test-token", user: full });
  return full;
}
