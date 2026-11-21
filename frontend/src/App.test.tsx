/** Page-level tests: the real app against a fake backend (test/server.ts). */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import App from "./App";
import { today } from "./lib/calendar";
import { category, mockServer, noteSummary, signIn, task, USER } from "./test/server";
import type { ChatMessage } from "./types";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("landing page", () => {
  it("switches theme and language and opens registration", async () => {
    mockServer({});
    const user = userEvent.setup();
    renderAt("/");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getAllByRole("region")).toHaveLength(9);
    const links = within(screen.getByRole("navigation", { name: "Main navigation" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      Array.from(document.querySelectorAll(".landing main > section"), (section) => `#${section.id}`),
    );

    const faq = screen.getByText("Can I use the AI without a cloud AI service?");
    await user.click(faq);
    expect(faq.closest("details")).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: "Toggle color theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    const language = screen.getByRole("button", { name: /Switch language/ });
    expect(language).toHaveTextContent("English");
    await user.click(language);
    expect(document.documentElement.dir).toBe("rtl");
    expect(language).toHaveTextContent("فارسی");
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "فضاهای کار" })).toHaveAttribute(
      "href",
      "#workspaces",
    );
    await user.click(within(screen.getByRole("main")).getAllByRole("link", { name: "ساخت حساب" })[0]!);
    expect(window.location.pathname).toBe("/register");
    expect(screen.getByLabelText("ایمیل")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("sign-in screen", () => {
  it("uses the saved language with right-to-left layout", () => {
    mockServer({});
    localStorage.setItem("notes.language", JSON.stringify("fa"));
    renderAt("/login");

    expect(document.documentElement.lang).toBe("fa");
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByLabelText("ایمیل")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("signs in and opens the dashboard", async () => {
    const { calls } = mockServer({
      "POST /api/auth/login": () => ({ token: "t1", user: USER }),
    });
    const user = userEvent.setup();
    renderAt("/login");

    await user.click(screen.getByRole("tab", { name: "Sign in" }));
    await user.type(screen.getByLabelText("Email"), "sara@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { level: 1, name: /Sara/ })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/auth/login")?.body).toEqual({
      email: "sara@example.com",
      password: "secret-password",
    });
  });

  it("shows translated server errors", async () => {
    mockServer({
      "POST /api/auth/login": () =>
        new Response(JSON.stringify({ detail: "x", code: "invalid_credentials" }), { status: 401 }),
    });
    const user = userEvent.setup();
    renderAt("/login");
    await user.click(screen.getByRole("tab", { name: "Sign in" }));
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/password/i);
  });
});

describe("dashboard", () => {
  it("shows today's and overdue tasks, favorites and recent notes", async () => {
    signIn();
    mockServer({
      "GET /api/tasks": () => [
        task({ id: 1, title: "Due today", due_date: today() }),
        task({ id: 2, title: "Late one", due_date: "2020-01-01" }),
      ],
      "GET /api/notes": () => [
        noteSummary({ id: 1, title: "Starred note", is_favorite: true }),
        noteSummary({ id: 2, title: "Plain note" }),
      ],
    });
    renderAt("/");

    const todayCard = (await screen.findByText("Today", { selector: "h2 span" })).closest("section")!;
    expect(await within(todayCard).findByText("Due today")).toBeInTheDocument();
    expect(within(todayCard).getByText("Late one")).toBeInTheDocument();

    const favorites = screen.getByText("Favorites", { selector: "h2 span" }).closest("section")!;
    expect(within(favorites).getByText("Starred note")).toBeInTheDocument();
    expect(within(favorites).queryByText("Plain note")).not.toBeInTheDocument();
  });

  it("renders in Persian with Jalali dates for Persian users", async () => {
    signIn({ language: "fa" });
    mockServer({});
    renderAt("/");
    expect(await screen.findByText("امروز", { selector: "h2 span" })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    // The date line uses Persian digits and a Persian month name.
    expect(document.querySelector(".eyebrow")?.textContent).toMatch(/[۰-۹]/);
  });
});

describe("notes", () => {
  it("filters favorites through the URL and the API", async () => {
    signIn();
    const { calls } = mockServer({
      "GET /api/notes": (_body, url) =>
        url.searchParams.get("favorite") === "true"
          ? [noteSummary({ id: 1, title: "Starred", is_favorite: true })]
          : [
              noteSummary({ id: 1, title: "Starred", is_favorite: true }),
              noteSummary({ id: 2, title: "Other" }),
            ],
    });
    renderAt("/notes?favorites=1");

    expect(await screen.findByText("Starred")).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/notes" && c.method === "GET")).toBe(true);
  });
});

describe("ask AI", () => {
  it("sends the selected categories as the chat scope", async () => {
    signIn();
    const message = (id: number, role: "user" | "assistant", content: string): ChatMessage => ({
      id,
      role,
      content,
      sources: role === "assistant" ? [{ id: 7, title: "Plan" }] : [],
      cited_note_ids: role === "assistant" ? [7] : [],
      partial: false,
      created_at: "2026-11-12T10:00:00Z",
    });
    const conversation = {
      id: 5,
      title: "When?",
      scope: { category_ids: [2], include_uncategorized: true },
      created_at: "2026-11-12T10:00:00Z",
      updated_at: "2026-11-12T10:00:00Z",
    };
    const { calls } = mockServer({
      "GET /api/categories": () => [
        category({ id: 1, name: "Work" }),
        category({ id: 2, name: "Home", color: "green" }),
      ],
      "POST /api/chats": () => conversation,
      "POST /api/chats/:id/messages": () => ({
        conversation,
        user_message: message(1, "user", "When is the trip?"),
        assistant_message: message(2, "assistant", "On Friday [note:7]."),
      }),
      "GET /api/chats/:id": () => ({ ...conversation, messages: [] }),
    });
    const user = userEvent.setup();
    renderAt("/ask");

    await user.click(await screen.findByRole("button", { name: /All notes/ }));
    await user.click(await screen.findByRole("checkbox", { name: /Work/ }));
    await user.type(screen.getByRole("textbox", { name: /Ask/ }), "When is the trip?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/On Friday/)).toBeInTheDocument();
    const sent = calls.find((c) => c.path === "/api/chats/5/messages");
    expect(sent?.body).toMatchObject({
      content: "When is the trip?",
      scope: { category_ids: [2], include_uncategorized: true },
    });
  });
});

describe("settings", () => {
  it("changes the language and flips the layout direction", async () => {
    signIn();
    const { calls } = mockServer({
      "PATCH /api/auth/me": (body) => ({ ...USER, ...(body as object) }),
    });
    const user = userEvent.setup();
    renderAt("/settings/language");

    await user.click(await screen.findByRole("radio", { name: /فارسی/ }));

    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ language: "fa" });
  });

  it("lists every section in the settings navigation", async () => {
    signIn();
    mockServer({});
    renderAt("/settings");
    const nav = await screen.findByRole("navigation", { name: "Settings" });
    for (const name of ["Profile", "Appearance", "Language", "Categories", "Accounts"]) {
      expect(within(nav).getByRole("link", { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
});
