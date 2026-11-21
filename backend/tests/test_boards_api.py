"""Kanban boards: templates, ordering, moves, card details, archive, privacy."""

from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import register
from tests.test_files_api import PNG, upload


def new_board(client: TestClient, template: str = "kanban", **fields: Any) -> dict[str, Any]:
    response = client.post("/api/boards", json={"title": "Work", "template": template, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def titles(board: dict[str, Any]) -> list[list[str]]:
    return [[card["title"] for card in lst["cards"]] for lst in board["lists"]]


def add_card(client: TestClient, board_id: int, list_id: int, title: str, **extra: Any) -> dict:  # type: ignore[type-arg]
    response = client.post(
        f"/api/boards/{board_id}/cards", json={"list_id": list_id, "title": title, **extra}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_templates_follow_language(anon: TestClient) -> None:
    fa = TestClient(anon.app, headers=register(anon, "fa@example.com", language="fa"))
    board = new_board(fa, "kanban")
    assert [lst["title"] for lst in board["lists"]] == ["برای انجام", "در حال انجام", "انجام شد"]
    assert len(board["labels"]) == 6
    assert new_board(fa, "blank")["lists"] == []


def test_card_ordering_and_moves(client: TestClient) -> None:
    board = new_board(client)
    todo, doing, done = (lst["id"] for lst in board["lists"])
    for title in ("A", "B", "C"):
        add_card(client, board["id"], todo, title)
    first = add_card(client, board["id"], todo, "Z", index=0)
    board = client.get(f"/api/boards/{board['id']}").json()
    assert titles(board)[0] == ["Z", "A", "B", "C"]
    assert [c["position"] for c in board["lists"][0]["cards"]] == [0, 1, 2, 3]

    # Move Z into "doing", then move B within the list.
    client.patch(
        f"/api/boards/{board['id']}/cards/{first['id']}", json={"list_id": doing, "index": 0}
    )
    b = board["lists"][0]["cards"][2]
    client.patch(f"/api/boards/{board['id']}/cards/{b['id']}", json={"index": 0})
    board = client.get(f"/api/boards/{board['id']}").json()
    assert titles(board) == [["B", "A", "C"], ["Z"], []]
    assert [c["position"] for c in board["lists"][0]["cards"]] == [0, 1, 2]

    # Index past the end appends.
    client.patch(f"/api/boards/{board['id']}/cards/{b['id']}", json={"list_id": done, "index": 99})
    assert titles(client.get(f"/api/boards/{board['id']}").json()) == [["A", "C"], ["Z"], ["B"]]


def test_list_reorder_rename_delete(client: TestClient) -> None:
    board = new_board(client)
    todo, doing, done = (lst["id"] for lst in board["lists"])
    url = f"/api/boards/{board['id']}/lists"
    client.patch(f"{url}/{done}", json={"index": 0, "title": "Finished", "wip_limit": 3})
    lists = client.get(f"/api/boards/{board['id']}").json()["lists"]
    assert [lst["title"] for lst in lists] == ["Finished", "To do", "Doing"]
    assert lists[0]["wip_limit"] == 3

    add_card(client, board["id"], doing, "X")
    assert client.delete(f"{url}/{doing}").status_code == 204
    board = client.get(f"/api/boards/{board['id']}").json()
    assert [lst["position"] for lst in board["lists"]] == [0, 1]
    assert board["card_count"] == 0
    created = client.post(url, json={"title": "Later", "index": 1}).json()
    lists = client.get(f"/api/boards/{board['id']}").json()["lists"]
    assert [lst["id"] for lst in lists][1] == created["id"]
    assert todo in [lst["id"] for lst in lists]


def test_card_details(client: TestClient) -> None:
    board = new_board(client)
    list_id = board["lists"][0]["id"]
    card = add_card(client, board["id"], list_id, "Write report")
    label = board["labels"][0]["id"]
    image = upload(client, PNG, "shot.png").json()
    url = f"/api/boards/{board['id']}/cards/{card['id']}"

    updated = client.patch(
        url,
        json={
            "label_ids": [label, label, "missing"],
            "due_date": "2026-12-01",
            "description": {"type": "doc", "content": [{"type": "paragraph"}]},
            "description_text": "Details",
            "cover": "color:red",
            "checklists": [
                {
                    "id": "c1",
                    "title": "Steps",
                    "items": [
                        {"id": "i1", "text": "Draft", "done": True},
                        {"id": "i2", "text": "Send"},
                    ],
                }
            ],
            "attachments": [
                {"id": image["id"], "name": "shot.png", "kind": "image", "url": image["url"]}
            ],
        },
    ).json()
    assert updated["label_ids"] == [label]
    assert (updated["checklist_done"], updated["checklist_total"]) == (1, 2)
    assert updated["has_description"] is True
    assert updated["attachment_count"] == 1

    comment = client.post(f"{url}/comments", json={"text": " Looks good "}).json()
    assert comment["text"] == "Looks good"
    detail = client.get(url).json()
    assert detail["comment_count"] == 1
    assert detail["comments"][0]["id"] == comment["id"]
    assert client.delete(f"{url}/comments/{comment['id']}").status_code == 204

    bad = client.patch(url, json={"cover": "javascript:alert(1)"})
    assert bad.status_code == 422


def test_removing_a_label_removes_it_from_cards(client: TestClient) -> None:
    board = new_board(client)
    card = add_card(client, board["id"], board["lists"][0]["id"], "Task")
    first, second = board["labels"][0]["id"], board["labels"][1]["id"]
    client.patch(
        f"/api/boards/{board['id']}/cards/{card['id']}", json={"label_ids": [first, second]}
    )
    client.patch(f"/api/boards/{board['id']}", json={"labels": [board["labels"][1]]})
    detail = client.get(f"/api/boards/{board['id']}/cards/{card['id']}").json()
    assert detail["label_ids"] == [second]


def test_archive_restore_copy_sort(client: TestClient) -> None:
    board = new_board(client)
    list_id = board["lists"][0]["id"]
    base = f"/api/boards/{board['id']}"
    b = add_card(client, board["id"], list_id, "B", due_date=None)
    a = add_card(client, board["id"], list_id, "a")
    client.patch(f"{base}/cards/{b['id']}", json={"due_date": "2026-01-02"})

    client.patch(f"{base}/cards/{a['id']}", json={"archived": True})
    assert titles(client.get(base).json())[0] == ["B"]
    assert [c["title"] for c in client.get(f"{base}/archived").json()] == ["a"]
    moving_archived = client.patch(f"{base}/cards/{a['id']}", json={"index": 0})
    assert moving_archived.json()["code"] == "card_archived"
    client.patch(f"{base}/cards/{a['id']}", json={"archived": False})
    assert titles(client.get(base).json())[0] == ["B", "a"]

    copy = client.post(f"{base}/cards/{b['id']}/copy", json={}).json()
    assert copy["due_date"] == "2026-01-02"
    assert titles(client.get(base).json())[0] == ["B", "B", "a"]

    client.post(f"{base}/lists/{list_id}/sort", json={"by": "title"})
    assert titles(client.get(base).json())[0] == ["a", "B", "B"]
    client.post(f"{base}/lists/{list_id}/sort", json={"by": "due"})
    assert titles(client.get(base).json())[0][-1] == "a"

    client.post(f"{base}/lists/{list_id}/archive-cards")
    assert titles(client.get(base).json())[0] == []
    assert len(client.get(f"{base}/archived").json()) == 3


def test_board_list_and_update(client: TestClient) -> None:
    board = new_board(client, background="gradient:sunset")
    add_card(client, board["id"], board["lists"][0]["id"], "One")
    summary = client.get("/api/boards").json()[0]
    assert (summary["list_count"], summary["card_count"]) == (3, 1)
    patched = client.patch(
        f"/api/boards/{board['id']}", json={"starred": True, "background": "color:violet"}
    ).json()
    assert patched["starred"] is True
    assert (
        client.patch(f"/api/boards/{board['id']}", json={"background": "url(x)"}).status_code == 422
    )
    assert client.delete(f"/api/boards/{board['id']}").status_code == 204
    assert client.get("/api/boards").json() == []


def test_boards_are_private(client: TestClient, anon: TestClient) -> None:
    board = new_board(client)
    card = add_card(client, board["id"], board["lists"][0]["id"], "Mine")
    other = TestClient(anon.app, headers=register(anon, "other@example.com"))
    assert other.get(f"/api/boards/{board['id']}").status_code == 404
    assert (
        other.patch(
            f"/api/boards/{board['id']}/cards/{card['id']}", json={"title": "x"}
        ).status_code
        == 404
    )
    their = new_board(other)
    # A card cannot be moved into a list of another board.
    moved = client.patch(
        f"/api/boards/{board['id']}/cards/{card['id']}",
        json={"list_id": their["lists"][0]["id"]},
    )
    assert moved.status_code == 404
