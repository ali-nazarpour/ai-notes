"""Backup export/import: round trip into another account, URL rewriting, validation."""

import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.storage import MemoryStorage
from tests.conftest import create_note, register
from tests.test_files_api import PNG, upload
from tests.test_vault_api import BLOB, SETUP


def build_data(client: TestClient) -> dict:  # type: ignore[type-arg]
    category = client.post(
        "/api/categories", json={"name": "Trips", "color": "teal", "icon": ""}
    ).json()
    image = upload(client, PNG, "photo.png").json()
    create_note(
        client,
        "Shiraz",
        "Train on Friday",
        category_id=category["id"],
        cover=image["url"],
        body={"type": "doc", "content": [{"type": "media", "attrs": {"src": image["url"]}}]},
    )
    client.post("/api/tasks", json={"title": "Pack", "category_id": category["id"]})
    board = client.post("/api/boards", json={"title": "Plan", "template": "kanban"}).json()
    card = client.post(
        f"/api/boards/{board['id']}/cards",
        json={"list_id": board["lists"][1]["id"], "title": "Book hotel"},
    ).json()
    client.post(f"/api/boards/{board['id']}/cards/{card['id']}/comments", json={"text": "Done?"})
    client.post("/api/vault", json=SETUP)
    client.post("/api/vault/items", json={"data": BLOB})
    return {"image": image, "category": category}


def export(client: TestClient) -> bytes:
    response = client.get("/api/data/export")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    return response.content


def test_export_contains_everything(client: TestClient) -> None:
    build_data(client)
    archive = zipfile.ZipFile(io.BytesIO(export(client)))
    names = archive.namelist()
    assert "manifest.json" in names and "data.json" in names
    assert any(n.startswith("files/") for n in names)
    data = json.loads(archive.read("data.json"))
    assert [n["title"] for n in data["notes"]] == ["Shiraz"]
    assert data["boards"][0]["cards"][0]["comments"][0]["text"] == "Done?"
    assert data["vault"]["items"] == [{"data": BLOB}]
    assert json.loads(archive.read("manifest.json"))["format"] == "ai-notes-backup"


def test_import_into_another_account(
    client: TestClient, anon: TestClient, storage: MemoryStorage
) -> None:
    original = build_data(client)
    backup = export(client)
    other = TestClient(anon.app, headers=register(anon, "new@example.com"))

    response = other.post(
        "/api/data/import", files={"file": ("backup.zip", backup, "application/zip")}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["notes"] == 1 and result["boards"] == 1 and result["cards"] == 1
    assert result["files"] == 1 and result["vault_items"] == 1 and not result["vault_skipped"]

    note = other.get("/api/notes").json()[0]
    full = other.get(f"/api/notes/{note['id']}").json()
    assert full["cover"] != original["image"]["url"]  # rewritten to the new copy
    assert full["body"]["content"][0]["attrs"]["src"] == full["cover"]
    assert other.get(full["cover"]).content == PNG
    category = next(c for c in other.get("/api/categories").json() if c["name"] == "Trips")
    assert note["category_id"] == category["id"]
    assert other.get("/api/tasks").json()[0]["category_id"] == category["id"]
    board = other.get(f"/api/boards/{other.get('/api/boards').json()[0]['id']}").json()
    assert board["lists"][1]["cards"][0]["comment_count"] == 1
    assert other.get("/api/vault").json()["salt"] == SETUP["salt"]


def test_import_twice_reuses_categories_and_skips_foreign_vault(client: TestClient) -> None:
    build_data(client)
    backup = export(client)
    client.post("/api/vault/reset", json={"password": "correct horse 1"})
    client.post("/api/vault", json={**SETUP, "salt": "b3RoZXJzYWx0b3RoZXJzYWx0"})
    result = client.post("/api/data/import", files={"file": ("b.zip", backup)}).json()
    assert result["categories"] == 0
    assert result["vault_skipped"] is True
    assert len(client.get("/api/notes").json()) == 2


def test_rejects_invalid_backups(client: TestClient) -> None:
    def send(content: bytes):  # type: ignore[no-untyped-def]
        return client.post("/api/data/import", files={"file": ("x.zip", content)})

    assert send(b"not a zip").json()["code"] == "invalid_backup"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps({"format": "other"}))
        archive.writestr("data.json", "{}")
    assert send(buffer.getvalue()).json()["code"] == "invalid_backup"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("../escape.txt", "x")
        archive.writestr("manifest.json", json.dumps({"format": "ai-notes-backup", "version": 1}))
        archive.writestr("data.json", "{}")
    assert send(buffer.getvalue()).json()["code"] == "invalid_backup"


def test_failed_import_leaves_nothing_behind(client: TestClient, storage: MemoryStorage) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps({"format": "ai-notes-backup", "version": 1}))
        archive.writestr("files/a.png", PNG)
        data = {
            "files": [{"id": "00000000-0000-0000-0000-000000000001", "path": "files/a.png"}],
            "notes": "not a list",
        }
        archive.writestr("data.json", json.dumps(data))
    before = dict(storage.objects)
    response = client.post("/api/data/import", files={"file": ("x.zip", buffer.getvalue())})
    assert response.status_code == 422
    assert storage.objects == before
    assert client.get("/api/notes").json() == []


def test_summary_counts(client: TestClient) -> None:
    build_data(client)
    counts = client.get("/api/data/summary").json()
    assert counts["notes"] == 1 and counts["boards"] == 1 and counts["vault_items"] == 1
