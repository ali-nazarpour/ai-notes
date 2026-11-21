"""Notes: create, read, PATCH, rich body, cover, favorites, search, large content."""

from fastapi.testclient import TestClient

from tests.conftest import create_note

DOC = {
    "type": "doc",
    "content": [
        {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Plan"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "Fly on Monday."}]},
    ],
}


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok", "database": "ok"}


def test_create_note_with_body_cover_and_excerpt(client: TestClient) -> None:
    note = create_note(
        client, "  Trip  ", "Plan\n\nFly on   Monday.", body=DOC, cover="gradient:aurora"
    )
    assert note["title"] == "Trip"
    assert note["body"] == DOC
    assert note["cover"] == "gradient:aurora"
    assert note["excerpt"] == "Plan Fly on Monday."
    assert note["is_favorite"] is False


def test_empty_title_is_allowed(client: TestClient) -> None:
    assert create_note(client, "")["title"] == ""


def test_list_returns_summaries_without_content(client: TestClient) -> None:
    create_note(client, "First", "a" * 1000)
    create_note(client, "Second", "b")

    notes = client.get("/api/notes").json()

    assert [n["title"] for n in notes] == ["Second", "First"]
    assert "content" not in notes[0] and "body" not in notes[0]
    assert len(notes[1]["excerpt"]) <= 281


def test_very_long_content_is_accepted(client: TestClient) -> None:
    long_text = "word " * 200_000  # one million characters
    note = create_note(client, "Book", long_text)
    assert len(client.get(f"/api/notes/{note['id']}").json()["content"]) == len(long_text)


def test_patch_changes_only_sent_fields(client: TestClient) -> None:
    note = create_note(client, "Trip", "old", cover="gradient:aurora")

    updated = client.patch(f"/api/notes/{note['id']}", json={"content": "new text"}).json()

    assert updated["content"] == "new text"
    assert updated["excerpt"] == "new text"
    assert updated["title"] == "Trip"
    assert updated["cover"] == "gradient:aurora"


def test_patch_can_clear_cover_and_category(client: TestClient) -> None:
    category = client.get("/api/categories").json()[0]
    note = create_note(client, "Trip", cover="gradient:aurora", category_id=category["id"])

    updated = client.patch(
        f"/api/notes/{note['id']}", json={"cover": None, "category_id": None}
    ).json()

    assert updated["cover"] is None
    assert updated["category_id"] is None


def test_favorite_does_not_change_updated_at(client: TestClient) -> None:
    note = create_note(client)
    updated = client.patch(f"/api/notes/{note['id']}", json={"is_favorite": True}).json()
    assert updated["is_favorite"] is True
    assert updated["updated_at"] == note["updated_at"]


def test_filters(client: TestClient) -> None:
    category = client.get("/api/categories").json()[0]
    a = create_note(client, "Docker basics", "containers", category_id=category["id"])
    create_note(client, "Recipes", "How to use DOCKER for baking")
    create_note(client, "Discount", "Save 100% today")
    client.patch(f"/api/notes/{a['id']}", json={"is_favorite": True})

    def titles(**params: str) -> list[str]:
        return sorted(n["title"] for n in client.get("/api/notes", params=params).json())

    assert titles(search="docker") == ["Docker basics", "Recipes"]
    assert titles(search="100%") == ["Discount"]
    assert titles(favorite="true") == ["Docker basics"]
    assert titles(category_id=str(category["id"])) == ["Docker basics"]


def test_validation(client: TestClient) -> None:
    note = create_note(client)
    assert client.post("/api/notes", json={"title": "x" * 201}).status_code == 422
    assert (
        client.post("/api/notes", json={"cover": "https://evil.example/x.png"}).status_code == 422
    )
    assert client.post("/api/notes", json={"body": {"type": "paragraph"}}).status_code == 422
    assert client.patch(f"/api/notes/{note['id']}", json={"title": None}).status_code == 422
    assert (
        client.post("/api/notes", json={"category_id": 999}).json()["code"] == "category_not_found"
    )


def test_missing_note(client: TestClient) -> None:
    response = client.get("/api/notes/999")
    assert response.status_code == 404
    assert response.json()["code"] == "note_not_found"
    assert client.patch("/api/notes/999", json={"title": "x"}).status_code == 404
    assert client.delete("/api/notes/999").status_code == 404


def test_delete(client: TestClient) -> None:
    note = create_note(client)
    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.get(f"/api/notes/{note['id']}").status_code == 404
