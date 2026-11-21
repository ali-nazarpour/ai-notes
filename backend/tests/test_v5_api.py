"""Drive, presentations, language learning and the global search."""

import io
import json
import zipfile
from collections.abc import Callable

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.storage import MemoryStorage
from tests.conftest import chat_response, create_note, register

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def upload(client: TestClient, name: str, data: bytes, **form: str) -> httpx.Response:
    return client.post("/api/drive/upload", files={"file": (name, data)}, data=form)


# ---------------------------------------------------------------- drive


def test_drive_folders_uploads_and_views(client: TestClient, storage: MemoryStorage) -> None:
    folder = client.post("/api/drive/folders", json={"name": "Photos", "color": "blue"}).json()
    assert folder["is_folder"] and folder["name"] == "Photos"
    # Same name in the same folder gets a number.
    again = client.post("/api/drive/folders", json={"name": "photos"}).json()
    assert again["name"] == "photos (2)"

    image = upload(client, "cat.png", PNG, parent_id=str(folder["id"])).json()
    assert image["kind"] == "image" and image["url"].startswith("/api/files/")
    # Any file type is accepted; unknown types are stored as a plain download.
    tool = upload(client, "setup.exe", b"MZ\x90\x00binary").json()
    assert tool["content_type"] == "application/octet-stream"
    download = client.get(tool["url"])
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]
    # A file from a dropped folder creates the folders of its path.
    nested = upload(client, "a.txt", b"hello", relative_path="Docs/2024/a.txt").json()
    root = client.get("/api/drive").json()
    names = [i["name"] for i in root["items"]]
    assert names[:3] == ["Docs", "Photos", "photos (2)"]  # folders first, by name
    docs = next(i for i in root["items"] if i["name"] == "Docs")
    inner = client.get("/api/drive", params={"folder": docs["id"]}).json()
    assert inner["path"] == [{"id": docs["id"], "name": "Docs"}]
    year = inner["items"][0]
    assert year["name"] == "2024" and year["item_count"] == 1
    assert nested["parent_id"] == year["id"]

    # Rename, star, move; a folder cannot go into itself.
    renamed = client.patch(f"/api/drive/items/{image['id']}", json={"name": "kitty.png"}).json()
    assert renamed["name"] == "kitty.png"
    client.patch(f"/api/drive/items/{image['id']}", json={"starred": True})
    assert [i["id"] for i in client.get("/api/drive?view=starred").json()["items"]] == [image["id"]]
    cycle = client.patch(f"/api/drive/items/{docs['id']}", json={"parent_id": year["id"]})
    assert cycle.status_code == 409
    moved = client.patch(f"/api/drive/items/{image['id']}", json={"parent_id": None}).json()
    assert moved["parent_id"] is None

    hits = client.get("/api/drive", params={"view": "search", "q": "kitty"}).json()["items"]
    assert [h["id"] for h in hits] == [image["id"]]
    assert {i["id"] for i in client.get("/api/drive?view=recent").json()["items"]} >= {
        image["id"],
        tool["id"],
    }

    # Trash hides a folder with everything inside; restore brings it back.
    assert client.post(f"/api/drive/items/{docs['id']}/trash").status_code == 204
    assert client.get("/api/drive", params={"view": "search", "q": "a.txt"}).json()["items"] == []
    trash = client.get("/api/drive?view=trash").json()["items"]
    assert [t["id"] for t in trash] == [docs["id"]]
    client.post(f"/api/drive/items/{docs['id']}/restore")
    assert client.get("/api/drive?view=trash").json()["items"] == []

    usage = client.get("/api/drive/usage").json()
    assert usage["files"] == 3 and usage["folders"] == 4
    assert usage["used"] == len(PNG) + len(b"MZ\x90\x00binary") + 5

    # Deleting forever removes the stored bytes too.
    before = len(storage.objects)
    client.post(f"/api/drive/items/{docs['id']}/trash")
    assert client.delete("/api/drive/trash").status_code == 204
    assert len(storage.objects) == before - 1
    assert client.get(f"/api/drive/items/{nested['id']}").status_code == 404


def test_drive_limits_set_by_admin(client: TestClient) -> None:
    # The first account is the administrator.
    settings = client.put(
        "/api/admin/settings/drive",
        json={"max_file_mb": 1, "workspace_quota_mb": 2, "blocked_extensions": [".EXE", "bat"]},
    ).json()
    assert settings["blocked_extensions"] == ["exe", "bat"]
    blocked = upload(client, "virus.exe", b"MZ")
    assert blocked.status_code == 422 and blocked.json()["code"] == "drive_type_blocked"
    big = upload(client, "big.bin", b"0" * (1024 * 1024 + 1))
    assert big.json()["code"] == "file_too_large"
    assert upload(client, "one.bin", b"0" * (1024 * 1024)).status_code == 201
    assert upload(client, "two.bin", b"0" * (1024 * 1024)).status_code == 201
    full = upload(client, "three.bin", b"0" * 10)
    assert full.json()["code"] == "drive_full"
    usage = client.get("/api/drive/usage").json()
    assert usage["quota"] == 2 * 1024 * 1024 and usage["max_file"] == 1024 * 1024


def test_drive_sharing_and_public_links(client: TestClient, anon: TestClient) -> None:
    folder = client.post("/api/drive/folders", json={"name": "Team"}).json()
    sub = client.post(
        "/api/drive/folders", json={"name": "Plans", "parent_id": folder["id"]}
    ).json()
    file = upload(client, "plan.txt", b"step one", parent_id=str(sub["id"])).json()

    friend = TestClient(app, headers=register(anon, "friend@example.com"))
    assert friend.get(f"/api/drive/items/{file['id']}").status_code == 404
    shared = client.post(
        "/api/shares",
        json={"kind": "drive", "item_id": folder["id"], "email": "friend@example.com"},
    )
    assert shared.status_code == 201, shared.text
    # Sharing a folder shares what is inside it, read-only.
    listing = friend.get("/api/drive", params={"folder": sub["id"]}).json()
    assert listing["role"] == "viewer"
    assert [c["name"] for c in listing["path"]] == ["Team", "Plans"]
    assert [i["id"] for i in listing["items"]] == [file["id"]]
    assert friend.patch(f"/api/drive/items/{file['id']}", json={"name": "x"}).status_code == 403
    assert [i["id"] for i in friend.get("/api/drive?view=shared").json()["items"]] == [folder["id"]]
    assert friend.get("/api/shares/with-me").json()[0]["url"] == f"/drive/item/{folder['id']}"

    token = client.put(f"/api/drive/items/{folder['id']}/link", json={"enabled": True}).json()[
        "token"
    ]
    public = anon.get(f"/api/public/drive/{token}").json()
    assert public["root"]["name"] == "Team" and public["items"][0]["name"] == "Plans"
    inside = anon.get(f"/api/public/drive/{token}", params={"folder": sub["id"]}).json()
    assert [c["name"] for c in inside["path"]] == ["Team", "Plans"]
    assert inside["items"][0]["url"] == file["url"]
    # Folders outside the shared one cannot be opened through the link.
    other = client.post("/api/drive/folders", json={"name": "Private"}).json()
    assert anon.get(f"/api/public/drive/{token}", params={"folder": other["id"]}).status_code == 404
    archive = anon.get(f"/api/public/drive/{token}/zip")
    assert archive.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(archive.content)).namelist()
    assert names == ["Plans/plan.txt"]
    client.put(f"/api/drive/items/{folder['id']}/link", json={"enabled": False})
    assert anon.get(f"/api/public/drive/{token}").status_code == 404


# ---------------------------------------------------------------- presentations


def test_slides_crud_duplicate_and_share(client: TestClient, anon: TestClient) -> None:
    deck = client.post("/api/slides", json={"title": "Launch plan"}).json()
    assert deck["slides"][0]["layout"] == "title"
    assert deck["slides"][0]["title"] == "Launch plan"
    slides = [
        {"id": "a1", "layout": "title", "title": "Launch", "evil": "<script>"},
        {"id": "b2", "layout": "image", "image": "/api/files/x", "duration": 5},
    ]
    updated = client.patch(
        f"/api/slides/{deck['id']}",
        json={
            "slides": slides,
            "music_url": "/api/files/song",
            "auto_seconds": 4,
            "theme": "ocean",
        },
    ).json()
    assert len(updated["slides"]) == 2 and "evil" not in updated["slides"][0]
    assert updated["auto_seconds"] == 4 and updated["theme"] == "ocean"
    assert client.patch(f"/api/slides/{deck['id']}", json={"theme": "neon"}).status_code == 422

    listed = client.get("/api/slides").json()
    assert listed[0]["slide_count"] == 2 and listed[0]["has_music"]
    copy = client.post(f"/api/slides/{deck['id']}/duplicate").json()
    assert copy["title"] == "Launch plan (copy)"
    assert {s["id"] for s in copy["slides"]}.isdisjoint({"a1", "b2"})

    friend = TestClient(app, headers=register(anon, "viewer@example.com"))
    assert friend.get(f"/api/slides/{deck['id']}").status_code == 404
    client.post(
        "/api/shares", json={"kind": "deck", "item_id": deck["id"], "email": "viewer@example.com"}
    )
    seen = friend.get(f"/api/slides/{deck['id']}").json()
    assert seen["role"] == "viewer"
    assert client.delete(f"/api/slides/{deck['id']}").status_code == 204
    assert friend.get("/api/shares/with-me").json() == []


def test_slides_ai_draft(client: TestClient, mock_ollama: Callable) -> None:
    reply = {
        "title": "Healthy sleep",
        "slides": [
            {"layout": "title", "title": "Healthy sleep", "subtitle": "Why it matters"},
            {"layout": "content", "title": "Tips", "bullets": ["Dark room", "No phone"]},
            {"layout": "weird", "title": "Summary", "bullets": []},
            {"layout": "content", "title": ""},
        ],
    }
    mock_ollama(lambda request: chat_response(json.dumps(reply)))
    draft = client.post("/api/slides/ai", json={"topic": "Sleep", "count": 4}).json()
    assert draft["title"] == "Healthy sleep"
    assert [s["layout"] for s in draft["slides"]] == ["title", "content", "content"]
    assert draft["slides"][1]["body"] == "- Dark room\n- No phone"


# ---------------------------------------------------------------- language learning


def test_flashcards_spaced_repetition_and_stats(client: TestClient) -> None:
    deck = client.post(
        "/api/learn/decks", json={"name": "English 1", "source_lang": "en", "target_lang": "fa"}
    ).json()
    cards = client.post(
        f"/api/learn/decks/{deck['id']}/cards/bulk",
        json={"cards": [{"front": "apple", "back": "سیب"}, {"front": "run", "back": "دویدن"}]},
    ).json()
    assert len(cards) == 2 and cards[0]["state"] == "new"
    previews = cards[0]["previews"]
    assert previews["1"] == 60 and previews["3"] == 600 and previews["4"] == 4 * 86400

    queue = client.get("/api/learn/study", params={"deck": deck["id"]}).json()
    assert queue["new"] == 2 and len(queue["cards"]) == 2
    apple = cards[0]["id"]
    first = client.post(f"/api/learn/cards/{apple}/review", json={"grade": 3}).json()
    assert first["state"] == "learning"
    second = client.post(f"/api/learn/cards/{apple}/review", json={"grade": 3}).json()
    assert second["state"] == "review" and second["interval_days"] == 1
    third = client.post(f"/api/learn/cards/{apple}/review", json={"grade": 3}).json()
    assert third["interval_days"] == 2.5  # 1 day x ease 2.5
    lapse = client.post(f"/api/learn/cards/{apple}/review", json={"grade": 1}).json()
    assert lapse["state"] == "learning" and lapse["lapses"] == 1 and lapse["ease"] == 2.3

    summary = client.get(f"/api/learn/decks/{deck['id']}").json()
    assert summary["total"] == 2 and summary["new"] == 1 and summary["learning"] == 1
    stats = client.get("/api/learn/stats", params={"tz": 210}).json()
    assert stats["reviews_today"] == 4 and stats["correct_today"] == 3
    assert stats["streak"] == 1 and sum(stats["days"].values()) == 4

    # The daily limit of new cards counts cards seen today.
    client.patch(f"/api/learn/decks/{deck['id']}", json={"new_per_day": 1})
    assert client.get("/api/learn/study", params={"deck": deck["id"]}).json()["new"] == 0
    reset = client.post(f"/api/learn/cards/{apple}/reset").json()
    assert reset["state"] == "new" and reset["reps"] == 0
    moved = client.patch(f"/api/learn/cards/{apple}", json={"starred": True, "back": "سیب قرمز"})
    assert moved.json()["back"] == "سیب قرمز"
    practice = client.get("/api/learn/study", params={"mode": "starred"}).json()
    assert [c["id"] for c in practice["cards"]] == [apple]


def test_learning_ai_and_songs(client: TestClient, mock_ollama: Callable) -> None:
    replies = iter(
        [
            {
                "cards": [
                    {
                        "front": "hello",
                        "back": "سلام",
                        "pronunciation": "həˈloʊ",
                        "example": "Hello there!",
                        "example_translation": "سلام!",
                    },
                    {"front": "", "back": "skip"},
                ]
            },
            {"lines": [{"n": 3, "translation": "سلام از آن طرف"}, {"n": 1, "translation": "سلام"}]},
        ]
    )
    prompts: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        prompts.append(request.content.decode())
        return chat_response(json.dumps(next(replies)))

    mock_ollama(handler)
    cards = client.post("/api/learn/ai/cards", json={"words": "hello"}).json()["cards"]
    assert cards == [
        {
            "front": "hello",
            "back": "سلام",
            "pronunciation": "/həˈloʊ/",
            "part_of_speech": "",
            "example": "Hello there!",
            "example_translation": "سلام!",
            "notes": "",
            "image": None,
            "tags": [],
        }
    ]
    lines = ["Hello", "", "Hello from the other side"]
    translated = client.post(
        "/api/learn/ai/translate-lines", json={"lines": lines, "title": "Hello"}
    ).json()
    assert translated["translations"] == ["سلام", "", "سلام از آن طرف"]
    assert "3. Hello from the other side" in prompts[1]

    song = client.post(
        "/api/learn/songs",
        json={
            "title": "Hello",
            "artist": "Adele",
            "youtube_url": "https://www.youtube.com/watch?v=YQHsXMglC9A",
            "lines": [{"time": 1.5, "text": "Hello", "translation": "سلام", "x": 1}],
        },
    ).json()
    assert song["lines"] == [{"time": 1.5, "text": "Hello", "translation": "سلام"}]
    patched = client.patch(
        f"/api/learn/songs/{song['id']}", json={"lines": [{"time": None, "text": "It's me"}]}
    ).json()
    assert patched["lines"][0]["text"] == "It's me"
    assert len(client.get("/api/learn/songs").json()) == 1
    assert client.delete(f"/api/learn/songs/{song['id']}").status_code == 204


# ---------------------------------------------------------------- search and chatbot


def test_global_search_covers_every_section(client: TestClient) -> None:
    create_note(client, "Zebra facts", "Zebras have stripes.")
    client.post("/api/tasks", json={"title": "Feed the zebra"})
    upload(client, "zebra.png", PNG)
    client.post(
        "/api/slides",
        json={"title": "Animals", "slides": [{"id": "s1", "body": "- The zebra runs fast"}]},
    )
    deck = client.post("/api/learn/decks", json={"name": "Animals"}).json()
    client.post(f"/api/learn/decks/{deck['id']}/cards", json={"front": "zebra", "back": "گورخر"})
    client.post("/api/learn/songs", json={"title": "Wild", "lines": [{"text": "Run like a zebra"}]})
    hits = client.get("/api/search", params={"q": "zebra"}).json()
    kinds = {h["kind"] for h in hits}
    assert kinds == {"note", "task", "drive", "deck", "lang_card", "song"}
    note = next(h for h in hits if h["kind"] == "note")
    assert "Zebras have stripes" in note["snippet"]
    assert next(h for h in hits if h["kind"] == "song")["url"].startswith("/learn/songs/")


def test_chatbot_reads_presentations_drive_and_flashcards(
    client: TestClient, mock_ollama: Callable
) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.content.decode())
        return chat_response("Found it [note:1].")

    mock_ollama(handler)
    client.post(
        "/api/slides",
        json={"title": "Budget", "slides": [{"id": "s1", "title": "Q3 budget is 9000"}]},
    )
    upload(client, "invoice-march.pdf", b"%PDF-1.4 test")
    deck = client.post("/api/learn/decks", json={"name": "Words"}).json()
    client.post(f"/api/learn/decks/{deck['id']}/cards", json={"front": "brave", "back": "شجاع"})
    chat = client.post("/api/chats", json={}).json()
    assert {"slides", "drive", "learn"} <= set(chat["scope"]["sources"])
    reply = client.post(
        f"/api/chats/{chat['id']}/messages", json={"content": "What is the budget?"}
    )
    assert reply.status_code == 201
    prompt = json.loads(seen[0])["messages"][-1]["content"]
    assert "Q3 budget is 9000" in prompt or "Q3 budget is 9000" in seen[0]
    assert "invoice-march.pdf" in seen[0]
    assert "brave = شجاع" in seen[0]


def test_search_words_any_order_persian_variants_and_ranking(client: TestClient) -> None:
    create_note(client, "Weekly plan", "We will visit the zebra house on Friday.")
    create_note(client, "Zebra house", "Notes about the trip.")
    create_note(client, "کتاب‌های علمی", "فهرست کتاب ها")
    hits = client.get("/api/search", params={"q": "house zebra"}).json()
    titles = [h["title"] for h in hits if h["kind"] == "note"]
    assert titles == ["Zebra house", "Weekly plan"]  # the title match ranks first
    # Arabic yeh/kaf and a missing zero-width joiner still find the Persian title.
    arabic = client.get("/api/search", params={"q": "كتابهاي"}).json()
    assert [h["title"] for h in arabic] == ["کتاب‌های علمی"]
    assert client.get("/api/search", params={"q": "zebra moon"}).json() == []


def test_search_includes_alarms_and_categories(client: TestClient) -> None:
    client.post("/api/alarms", json={"title": "Dentist appointment", "time": "09:30"})
    client.post("/api/categories", json={"name": "Dentist", "color": "teal"})
    kinds = {h["kind"] for h in client.get("/api/search", params={"q": "dentist"}).json()}
    assert kinds == {"alarm", "category"}


def test_alarms(client: TestClient, anon: TestClient) -> None:
    bad = client.post("/api/alarms", json={"title": "x", "time": "25:00"})
    assert bad.status_code == 422
    alarm = client.post(
        "/api/alarms",
        json={
            "title": "Gym",
            "time": "7:5",
            "repeat": "weekly",
            "weekdays": [1, 3, 3, 9],
            "sound": "bell",
        },
    ).json()
    assert alarm["time"] == "07:05" and alarm["weekdays"] == [1, 3] and alarm["enabled"]
    once = client.post(
        "/api/alarms", json={"title": "Call mom", "time": "18:00", "date": "2026-12-01"}
    ).json()
    assert [a["title"] for a in client.get("/api/alarms").json()] == ["Gym", "Call mom"]

    # Ringing is recorded once; a one-time alarm turns itself off.
    first = client.post(f"/api/alarms/{once['id']}/fired", json={"at": "2026-12-01T14:30:00Z"})
    assert first.status_code == 200 and first.json()["enabled"] is False
    again = client.post(f"/api/alarms/{once['id']}/fired", json={"at": "2026-12-01T14:30:00Z"})
    assert again.status_code == 409
    snoozed = client.post(f"/api/alarms/{once['id']}/snooze", json={"minutes": 10}).json()
    assert snoozed["snoozed_until"] and snoozed["enabled"]

    changed = client.patch(f"/api/alarms/{alarm['id']}", json={"time": "08:00", "note": "Legs"})
    assert changed.json()["time"] == "08:00" and changed.json()["note"] == "Legs"
    # Alarms are personal: another account cannot see or change them.
    other = TestClient(app, headers=register(anon, "other@example.com"))
    assert other.get("/api/alarms").json() == []
    assert other.delete(f"/api/alarms/{alarm['id']}").status_code == 404
    assert client.delete(f"/api/alarms/{alarm['id']}").status_code == 204


MP3 = b"ID3\x03\x00\x00\x00" + b"\x00" * 64


def test_drive_sections_keep_their_own_files_and_folders(client: TestClient) -> None:
    folder = client.post("/api/drive/folders", json={"name": "Rock", "section": "music"}).json()
    assert folder["section"] == "music"
    song = upload(client, "song.mp3", MP3, section="music", parent_id=str(folder["id"])).json()
    assert song["section"] == "music" and song["kind"] == "audio"
    wrong = upload(client, "cat.png", PNG, section="music")
    assert wrong.status_code == 422 and wrong.json()["code"] == "drive_wrong_section"
    assert upload(client, "cat.png", PNG, section="photos").status_code == 201
    assert upload(client, "doc.pdf", b"%PDF-1.4 x", section="documents").status_code == 201
    assert upload(client, "cat.png", PNG, section="documents").status_code == 422
    # Each section has its own root; My Drive does not show them.
    assert client.get("/api/drive").json()["items"] == []
    music = client.get("/api/drive", params={"section": "music"}).json()["items"]
    assert [i["name"] for i in music] == ["Rock"]
    photos_folder = client.post(
        "/api/drive/folders", json={"name": "Trip", "section": "photos"}
    ).json()
    moved = client.patch(f"/api/drive/items/{song['id']}", json={"parent_id": photos_folder["id"]})
    assert moved.json()["code"] == "drive_wrong_section"
    assert [f["name"] for f in client.get("/api/drive/folders?section=music").json()] == ["Rock"]


def test_project_links_and_calendar(client: TestClient) -> None:
    project = client.post(
        "/api/projects",
        json={"name": "Website", "start_date": "2026-11-02", "end_date": "2026-11-28"},
    ).json()
    client.patch(
        f"/api/projects/{project['id']}",
        json={
            "milestones": [
                {"id": "m1", "title": "Design ready", "date": "2026-11-10", "done": False}
            ]
        },
    )
    note = create_note(client, "Brief", "What the site should do")
    board = client.post("/api/boards", json={"title": "Launch"}).json()
    options = client.get(
        f"/api/projects/{project['id']}/link-options", params={"kind": "note", "q": "bri"}
    ).json()
    assert [o["id"] for o in options] == [note["id"]]
    for kind, item_id in (("note", note["id"]), ("board", board["id"])):
        linked = client.post(
            f"/api/projects/{project['id']}/links", json={"kind": kind, "item_id": item_id}
        )
        assert linked.status_code == 200 and linked.json()["project_id"] == project["id"]
    folder = client.post(f"/api/projects/{project['id']}/drive-folder").json()
    again = client.post(f"/api/projects/{project['id']}/drive-folder").json()
    assert folder["id"] == again["id"] and folder["title"] == "Website"
    links = client.get(f"/api/projects/{project['id']}/links").json()
    assert [n["title"] for n in links["note"]] == ["Brief"]
    assert [b["title"] for b in links["board"]] == ["Launch"]
    assert [d["title"] for d in links["drive"]] == ["Website"]
    # Linked items still work on their own; unlinking keeps them.
    assert client.get(f"/api/notes/{note['id']}").status_code == 200
    client.delete(f"/api/projects/{project['id']}/links/note/{note['id']}")
    assert client.get(f"/api/projects/{project['id']}/links").json()["note"] == []

    client.post("/api/alarms", json={"title": "Demo", "time": "10:00", "date": "2026-11-20"})
    events = client.get(
        "/api/calendar/events", params={"start": "2026-11-01", "end": "2026-11-30"}
    ).json()
    assert [(e["kind"], e["date"]) for e in events] == [
        ("project_start", "2026-11-02"),
        ("milestone", "2026-11-10"),
        ("alarm", "2026-11-20"),
        ("project_end", "2026-11-28"),
    ]
    # Deleting the project leaves the items.
    client.delete(f"/api/projects/{project['id']}")
    assert client.get(f"/api/boards/{board['id']}").status_code == 200


def test_explain_fills_missing_ipa(client: TestClient, mock_ollama: Callable) -> None:
    replies = iter(
        [
            {
                "card": {"front": "sniff", "back": "بوییدن", "example": "Dogs sniff."},
                "explanation": "یعنی با بینی بو کشیدن.",
            },
            {
                "cards": [
                    {
                        "front": "sniff",
                        "back": "بوییدن",
                        "pronunciation": "snɪf",
                        "part_of_speech": "فعل",
                        "example": "Dogs sniff.",
                        "example_translation": "سگ‌ها بو می‌کشند.",
                    }
                ]
            },
        ]
    )
    mock_ollama(lambda request: chat_response(json.dumps(next(replies))))
    result = client.post("/api/learn/ai/explain", json={"word": "sniff"}).json()
    assert result["card"]["pronunciation"] == "/snɪf/"
    assert result["card"]["part_of_speech"] == "فعل"
    assert result["card"]["example_translation"] == "سگ‌ها بو می‌کشند."
