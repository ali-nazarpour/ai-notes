"""Tests of tasks: the to-do list and the date-range queries the calendar uses."""

from fastapi.testclient import TestClient


def create_task(client: TestClient, title="Buy milk", **fields):
    response = client.post("/api/tasks", json={"title": title, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_task_with_date_and_category(client: TestClient):
    category = client.get("/api/categories").json()[0]

    task = create_task(client, due_date="2026-11-14", category_id=category["id"])

    assert task["title"] == "Buy milk"
    assert task["is_done"] is False
    assert task["due_date"] == "2026-11-14"
    assert task["category_id"] == category["id"]
    assert task["completed_at"] is None


def test_task_title_is_required(client: TestClient):
    assert client.post("/api/tasks", json={"title": "   "}).status_code == 422
    assert client.post("/api/tasks", json={}).status_code == 422
    assert (
        client.post("/api/tasks", json={"title": "x", "due_date": "not-a-date"}).status_code == 422
    )


def test_list_puts_open_tasks_first_then_by_date(client: TestClient):
    create_task(client, "No date")
    create_task(client, "Later", due_date="2026-12-01")
    create_task(client, "Sooner", due_date="2026-11-20")
    done = create_task(client, "Done", due_date="2026-11-01")
    client.patch(f"/api/tasks/{done['id']}", json={"is_done": True})

    titles = [t["title"] for t in client.get("/api/tasks").json()]

    assert titles == ["Sooner", "Later", "No date", "Done"]


def test_checking_a_task_sets_and_clears_completed_at(client: TestClient):
    task = create_task(client)

    done = client.patch(f"/api/tasks/{task['id']}", json={"is_done": True}).json()
    assert done["is_done"] is True
    assert done["completed_at"] is not None
    assert done["title"] == "Buy milk"  # PATCH did not touch other fields

    undone = client.patch(f"/api/tasks/{task['id']}", json={"is_done": False}).json()
    assert undone["completed_at"] is None


def test_patch_can_move_and_clear_the_due_date(client: TestClient):
    task = create_task(client, due_date="2026-11-14")

    moved = client.patch(f"/api/tasks/{task['id']}", json={"due_date": "2026-11-15"}).json()
    cleared = client.patch(f"/api/tasks/{task['id']}", json={"due_date": None}).json()

    assert moved["due_date"] == "2026-11-15"
    assert cleared["due_date"] is None


def test_patch_rejects_null_title_and_blank_title(client: TestClient):
    task = create_task(client)
    assert client.patch(f"/api/tasks/{task['id']}", json={"title": None}).status_code == 422
    assert client.patch(f"/api/tasks/{task['id']}", json={"title": " "}).status_code == 422
    assert client.patch(f"/api/tasks/{task['id']}", json={"is_done": None}).status_code == 422


def test_filter_by_date_range_and_done(client: TestClient):
    create_task(client, "Before", due_date="2026-10-31")
    create_task(client, "Inside", due_date="2026-11-10")
    create_task(client, "Last day", due_date="2026-11-30")
    create_task(client, "No date")

    in_november = client.get(
        "/api/tasks", params={"due_from": "2026-11-01", "due_to": "2026-11-30"}
    ).json()
    open_tasks = client.get("/api/tasks", params={"done": "false"}).json()

    assert [t["title"] for t in in_november] == ["Inside", "Last day"]
    assert len(open_tasks) == 4


def test_delete_task(client: TestClient):
    task = create_task(client)
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.get("/api/tasks").json() == []
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 404


def test_task_with_unknown_category_is_rejected(client: TestClient):
    assert client.post("/api/tasks", json={"title": "x", "category_id": 999}).status_code == 422
    task = create_task(client)
    response = client.patch(f"/api/tasks/{task['id']}", json={"category_id": 999})
    assert response.status_code == 422
