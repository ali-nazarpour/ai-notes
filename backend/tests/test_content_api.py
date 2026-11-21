"""Documentation, blog, projects, note trash/history and the AI helpers."""

import json
from collections.abc import Callable

import httpx
from fastapi.testclient import TestClient

from app.services import link_preview
from tests.conftest import chat_response, create_note

DOC = {"type": "doc", "content": [{"type": "paragraph"}]}


# ---------------------------------------------------------------- documentation


def test_doc_space_template_and_page_tree(client: TestClient) -> None:
    space = client.post("/api/docs", json={"title": "React JS", "template": "guide"}).json()
    assert [p["title"] for p in space["pages"]][:2] == ["Introduction", "Getting started"]
    intro, start = space["pages"][0]["id"], space["pages"][1]["id"]
    base = f"/api/docs/{space['id']}"

    hooks = client.post(f"{base}/pages", json={"title": "Hooks", "parent_id": start}).json()
    state = client.post(
        f"{base}/pages", json={"title": "useState", "parent_id": hooks["id"]}
    ).json()

    # Cannot move a page inside its own child.
    cycle = client.post(
        f"{base}/pages/{hooks['id']}/move", json={"parent_id": state["id"], "index": 0}
    )
    assert cycle.json()["code"] == "doc_page_cycle"
    # Move Hooks to the top level, first position.
    assert (
        client.post(
            f"{base}/pages/{hooks['id']}/move", json={"parent_id": None, "index": 0}
        ).status_code
        == 204
    )
    tree = client.get(base).json()["pages"]
    top = sorted((p for p in tree if p["parent_id"] is None), key=lambda p: p["position"])
    assert top[0]["id"] == hooks["id"]
    assert [p["position"] for p in top] == list(range(len(top)))

    client.patch(
        f"{base}/pages/{intro}", json={"content": "React is a library for UI.", "body": DOC}
    )
    hits = client.get(f"{base}/search", params={"q": "library"}).json()
    assert hits[0]["id"] == intro

    # Deleting a page removes its sub-pages.
    assert client.delete(f"{base}/pages/{hooks['id']}").status_code == 204
    ids = {p["id"] for p in client.get(base).json()["pages"]}
    assert state["id"] not in ids


def test_doc_batch_and_duplicate(client: TestClient) -> None:
    space = client.post("/api/docs", json={"title": "API", "template": "blank"}).json()
    base = f"/api/docs/{space['id']}"
    created = client.post(
        f"{base}/pages/batch", json={"pages": [{"title": "Auth"}, {"title": "Errors"}]}
    ).json()
    assert [p["title"] for p in created] == ["Auth", "Errors"]
    copy = client.post(f"{base}/pages/{created[0]['id']}/duplicate").json()
    assert copy["title"] == "Auth (copy)"
    assert len(client.get(base).json()["pages"]) == 4


def test_ask_docs(client: TestClient, mock_ollama: Callable) -> None:
    space = client.post("/api/docs", json={"title": "Guide", "template": "blank"}).json()
    page_id = space["pages"][0]["id"]
    client.patch(f"/api/docs/{space['id']}/pages/{page_id}", json={"content": "Install with npm."})
    mock_ollama(lambda request: chat_response(f"Use npm [note:{page_id}]."))
    answer = client.post(
        f"/api/docs/{space['id']}/ask", json={"question": "How to install?"}
    ).json()
    assert answer["cited_ids"] == [page_id]
    assert answer["sources"][0]["url"] == f"/docs/{space['id']}/{page_id}"


# ---------------------------------------------------------------- blog


def test_blog_slug_publish_and_public_page(client: TestClient, anon: TestClient) -> None:
    first = client.post("/api/blog", json={"title": "Hello World!"}).json()
    second = client.post("/api/blog", json={"title": "Hello world"}).json()
    assert first["slug"] == "hello-world"
    assert second["slug"] == "hello-world-2"
    taken = client.patch(f"/api/blog/{second['id']}", json={"slug": "hello-world"})
    assert taken.json()["code"] == "slug_taken"

    published = client.patch(
        f"/api/blog/{first['id']}",
        json={"status": "published", "content": "word " * 450, "tags": ["news", "news", " x "]},
    ).json()
    assert published["published_at"] is not None
    assert published["reading_minutes"] == 3
    assert published["tags"] == ["news", "x"]

    slug = client.get("/api/workspaces/current").json()["slug"]
    # The public blog is off until the workspace turns it on.
    assert anon.get(f"/api/public/blog/{slug}").status_code == 404
    client.patch("/api/workspaces/current", json={"settings": {"blog_public": True}})
    public = anon.get(f"/api/public/blog/{slug}").json()
    assert [p["title"] for p in public["posts"]] == ["Hello World!"]  # drafts are hidden
    post = anon.get(f"/api/public/blog/{slug}/hello-world").json()
    assert post["views"] == 1
    assert anon.get(f"/api/public/blog/{slug}/hello-world-2").status_code == 404

    # Scheduled: published in the future is not visible yet.
    client.patch(
        f"/api/blog/{second['id']}",
        json={"status": "published", "published_at": "2999-01-01T00:00:00Z"},
    )
    assert len(anon.get(f"/api/public/blog/{slug}").json()["posts"]) == 1


def test_persian_slug(client: TestClient) -> None:
    post = client.post("/api/blog", json={"title": "سلام دنیا"}).json()
    assert post["slug"] == "سلام-دنیا"


# ---------------------------------------------------------------- projects


def test_project_progress_budget_and_links(client: TestClient) -> None:
    project = client.post(
        "/api/projects", json={"name": "Website", "kind": "software", "start_date": "2026-01-01"}
    ).json()
    assert project["progress"] == 0
    board = client.post("/api/boards", json={"title": "Sprint"}).json()
    updated = client.patch(
        f"/api/projects/{project['id']}",
        json={
            "budget": "1000.50",
            "board_id": board["id"],
            "milestones": [
                {"id": "a", "title": "Design", "done": True, "date": "2026-02-01"},
                {"id": "b", "title": "Build", "done": False},
            ],
            "expenses": [{"id": "e", "title": "Hosting", "amount": "250.25"}],
            "repositories": [{"id": "r", "url": "https://github.com/me/site"}],
            "members": [{"id": "m", "name": "Sara", "role": "Designer"}],
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["progress"] == 50
    assert float(body["spent"]) == 250.25
    assert body["milestones_done"] == 1
    assert body["board_id"] == board["id"]
    bad = client.patch(f"/api/projects/{project['id']}", json={"end_date": "2025-01-01"})
    assert bad.json()["code"] == "date_order"
    bad_repo = client.patch(
        f"/api/projects/{project['id']}", json={"repositories": [{"id": "r", "url": "ftp://x"}]}
    )
    assert bad_repo.status_code == 422
    assert (
        client.patch(f"/api/projects/{project['id']}", json={"progress": 80}).json()["progress"]
        == 80
    )


# ---------------------------------------------------------------- notes: trash, history, lock


def test_note_trash_and_restore(client: TestClient) -> None:
    note = create_note(client, "Old")
    assert client.post(f"/api/notes/{note['id']}/trash").status_code == 204
    assert client.get("/api/notes").json() == []
    assert [n["id"] for n in client.get("/api/notes/trash").json()] == [note["id"]]
    restored = client.post(f"/api/notes/{note['id']}/restore").json()
    assert restored["deleted_at"] is None
    client.post(f"/api/notes/{note['id']}/trash")
    assert client.delete("/api/notes/trash").json() == {"deleted": 1}


def test_note_history_and_restore(client: TestClient) -> None:
    note = create_note(client, "Draft", "first version")
    client.patch(f"/api/notes/{note['id']}", json={"content": "second version", "body": DOC})
    history = client.get(f"/api/notes/{note['id']}/revisions").json()
    assert len(history) == 1
    assert history[0]["excerpt"] == "first version"
    # Within 10 minutes no new version is stored.
    client.patch(f"/api/notes/{note['id']}", json={"content": "third version"})
    assert len(client.get(f"/api/notes/{note['id']}/revisions").json()) == 1
    restored = client.post(f"/api/notes/{note['id']}/revisions/{history[0]['id']}/restore").json()
    assert restored["content"] == "first version"
    assert len(client.get(f"/api/notes/{note['id']}/revisions").json()) == 2


def test_locked_note_and_settings(client: TestClient) -> None:
    note = create_note(client, "Fixed")
    locked = client.patch(
        f"/api/notes/{note['id']}", json={"settings": {"locked": True, "font": "serif"}}
    ).json()
    assert locked["settings"]["font"] == "serif"
    denied = client.patch(f"/api/notes/{note['id']}", json={"title": "x"})
    assert denied.json()["code"] == "note_locked"
    ok = client.patch(
        f"/api/notes/{note['id']}", json={"settings": {"locked": False}, "title": "Free"}
    )
    assert ok.json()["title"] == "Free"


def test_move_note_to_other_workspace(client: TestClient) -> None:
    other = client.post("/api/workspaces", json={"name": "Work"}).json()
    note = create_note(client, "Move me")
    moved = client.patch(f"/api/notes/{note['id']}", json={"workspace_id": other["id"]}).json()
    assert moved["workspace_id"] == other["id"]
    assert client.get("/api/notes").json() == []


# ---------------------------------------------------------------- AI helpers


def test_generate_list_uses_json_schema(client: TestClient, mock_ollama: Callable) -> None:
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return chat_response(
            json.dumps(
                {
                    "items": [
                        {"title": "Book flights", "date": "2026-03-01"},
                        {"title": "Pack", "date": "not a date"},
                        {"title": "  "},
                    ]
                }
            )
        )

    mock_ollama(handler)
    result = client.post(
        "/api/ai/generate", json={"kind": "tasks", "text": "Trip on March 1st, need to pack"}
    ).json()
    assert [i["title"] for i in result["items"]] == ["Book flights", "Pack"]
    assert result["items"][0]["date"] == "2026-03-01"
    assert result["items"][1]["date"] is None
    assert "format" in seen[0]

    created = client.post(
        "/api/tasks/batch", json={"tasks": [{"title": i["title"]} for i in result["items"]]}
    )
    assert created.status_code == 201
    assert len(client.get("/api/tasks").json()) == 2


def test_generate_text_and_briefing(client: TestClient, mock_ollama: Callable) -> None:
    mock_ollama(lambda request: chat_response('"A short summary."'))
    result = client.post(
        "/api/ai/generate", json={"kind": "excerpt", "text": "Long article"}
    ).json()
    assert result["text"] == "A short summary."
    client.post("/api/tasks", json={"title": "Pay rent", "due_date": "2020-01-01"})
    briefing = client.post("/api/ai/briefing").json()
    assert briefing["text"] == '"A short summary."'


def test_chat_can_read_docs_and_projects(client: TestClient, mock_ollama: Callable) -> None:
    space = client.post("/api/docs", json={"title": "Guide", "template": "blank"}).json()
    page_id = space["pages"][0]["id"]
    client.patch(f"/api/docs/{space['id']}/pages/{page_id}", json={"content": "Port is 8080."})
    note = create_note(client, "Misc", "nothing here")
    # Notes keep their ids; the doc page gets the next free id.
    doc_id = note["id"] + 1
    mock_ollama(lambda request: chat_response(f"It is 8080 [note:{doc_id}]."))
    chat = client.post("/api/chats", json={"scope": {"sources": ["notes", "docs"]}}).json()
    reply = client.post(f"/api/chats/{chat['id']}/messages", json={"content": "Which port?"}).json()
    sources = {s["id"]: s for s in reply["assistant_message"]["sources"]}
    assert sources[doc_id]["kind"] == "doc"
    assert sources[doc_id]["url"] == f"/docs/{space['id']}/{page_id}"
    assert reply["assistant_message"]["cited_note_ids"] == [doc_id]


# ---------------------------------------------------------------- files and link previews


def test_upload_audio_and_document(client: TestClient) -> None:
    audio = client.post(
        "/api/files", files={"file": ("song.mp3", b"ID3\x03\x00" + b"x" * 50, "audio/mpeg")}
    )
    assert audio.status_code == 201
    assert audio.json()["kind"] == "audio"
    pdf = client.post(
        "/api/files", files={"file": ("plan.pdf", b"%PDF-1.7\n" + b"x" * 50, "application/pdf")}
    )
    assert pdf.json()["kind"] == "file"
    download = client.get(pdf.json()["url"])
    assert download.headers["content-disposition"].startswith("attachment")
    text = client.post(
        "/api/files", files={"file": ("notes.md", "# سلام".encode(), "text/markdown")}
    )
    assert text.json()["content_type"] == "text/markdown"
    html = client.post(
        "/api/files", files={"file": ("x.html", b"<script>alert(1)</script>", "text/html")}
    )
    assert html.json()["code"] == "unsupported_file_type"


def test_link_preview_parsing_and_private_addresses(client: TestClient) -> None:
    page = """<html><head><title>Fallback</title>
    <meta property="og:title" content="React &amp; Hooks">
    <meta name="description" content="Learn hooks">
    <meta property="og:image" content="/cover.png">
    <link rel="icon" href="/fav.ico"></head></html>"""
    preview = link_preview.parse(page, "https://react.dev/learn")
    assert preview.title == "React & Hooks"
    assert preview.description == "Learn hooks"
    assert preview.image == "https://react.dev/cover.png"
    assert preview.site_name == "react.dev"
    blocked = client.get("/api/files/preview/link", params={"url": "http://127.0.0.1/admin"})
    assert blocked.json()["code"] == "link_preview_blocked"
    port = client.get("/api/files/preview/link", params={"url": "http://example.com:8080/"})
    assert port.json()["code"] == "link_preview_blocked"


def test_chat_reads_password_names_but_never_values(
    client: TestClient, mock_ollama: Callable
) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.content.decode())
        return chat_response("Your Gmail login is saved [note:1].")

    mock_ollama(handler)
    chat = client.post("/api/chats", json={}).json()
    assert "passwords" in chat["scope"]["sources"]  # every section by default
    reply = client.post(
        f"/api/chats/{chat['id']}/messages",
        json={
            "content": "Which email do I use for Gmail?",
            "vault": [
                {
                    "title": "Gmail",
                    "username": "me@gmail.com",
                    "url": "https://mail.google.com",
                    "password": "hunter2-secret",
                }
            ],
        },
    )
    assert reply.status_code == 201
    sources = reply.json()["assistant_message"]["sources"]
    assert sources[0]["kind"] == "passwords"
    assert sources[0]["url"] == "/passwords"
    assert "me@gmail.com" in seen[0]
    assert "hunter2-secret" not in seen[0]  # extra fields are dropped by the schema
