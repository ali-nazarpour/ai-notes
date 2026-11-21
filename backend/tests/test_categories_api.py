"""Tests of categories: CRUD, validation, counts, and how notes and tasks use them."""

from fastapi.testclient import TestClient


def create_category(client: TestClient, name="Work", color="violet", icon="💼"):
    response = client.post("/api/categories", json={"name": name, "color": color, "icon": icon})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_list_category(client: TestClient):
    created = create_category(client)

    assert created["name"] == "Work"
    assert created["color"] == "violet"
    assert created["icon"] == "💼"
    assert created["note_count"] == 0
    assert created["id"] in [c["id"] for c in client.get("/api/categories").json()]


def test_category_name_must_be_unique_ignoring_case(client: TestClient):
    create_category(client, "Work")
    response = client.post("/api/categories", json={"name": " work ", "color": "red"})
    assert response.status_code == 409


def test_category_validation(client: TestClient):
    assert client.post("/api/categories", json={"name": "X", "color": "gold"}).status_code == 422
    assert client.post("/api/categories", json={"name": "  ", "color": "red"}).status_code == 422
    too_long = {"name": "x" * 51, "color": "red"}
    assert client.post("/api/categories", json=too_long).status_code == 422


def test_update_category(client: TestClient):
    category = create_category(client)

    response = client.put(
        f"/api/categories/{category['id']}", json={"name": "Job", "color": "teal", "icon": ""}
    )

    assert response.status_code == 200
    assert (response.json()["name"], response.json()["color"]) == ("Job", "teal")


def test_update_category_to_an_existing_name_is_rejected(client: TestClient):
    create_category(client, "Work")
    other = create_category(client, "Home")
    response = client.put(f"/api/categories/{other['id']}", json={"name": "WORK", "color": "red"})
    assert response.status_code == 409


def test_counts_include_notes_and_only_open_tasks(client: TestClient):
    category = create_category(client)
    client.post("/api/notes", json={"title": "A", "category_id": category["id"]})
    client.post("/api/tasks", json={"title": "Open", "category_id": category["id"]})
    done = client.post("/api/tasks", json={"title": "Done", "category_id": category["id"]}).json()
    client.patch(f"/api/tasks/{done['id']}", json={"is_done": True})

    listed = next(c for c in client.get("/api/categories").json() if c["id"] == category["id"])

    assert listed["note_count"] == 1
    assert listed["open_task_count"] == 1


def test_notes_can_be_filtered_by_category(client: TestClient):
    category = create_category(client)
    client.post("/api/notes", json={"title": "In it", "category_id": category["id"]})
    client.post("/api/notes", json={"title": "Not in it"})

    titles = [
        n["title"] for n in client.get("/api/notes", params={"category_id": category["id"]}).json()
    ]

    assert titles == ["In it"]


def test_note_with_unknown_category_is_rejected(client: TestClient):
    response = client.post("/api/notes", json={"title": "x", "category_id": 9999})
    assert response.status_code == 422


def test_deleting_a_category_keeps_its_notes_and_tasks(client: TestClient):
    category = create_category(client)
    note = client.post(
        "/api/notes", json={"title": "Keep me", "category_id": category["id"]}
    ).json()
    task = client.post(
        "/api/tasks", json={"title": "Keep me", "category_id": category["id"]}
    ).json()

    assert client.delete(f"/api/categories/{category['id']}").status_code == 204

    assert client.get(f"/api/notes/{note['id']}").json()["category_id"] is None
    tasks = client.get("/api/tasks").json()
    assert next(t for t in tasks if t["id"] == task["id"])["category_id"] is None


def test_missing_category_returns_404(client: TestClient):
    assert client.delete("/api/categories/9999").status_code == 404
    response = client.put("/api/categories/9999", json={"name": "x", "color": "red"})
    assert response.status_code == 404
