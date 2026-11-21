"""Ask-AI conversations: history, category scope, citations, failures."""

import json
from collections.abc import Callable

import httpx
from fastapi.testclient import TestClient

from tests.conftest import chat_response, create_note, register

Install = Callable[[Callable[[httpx.Request], httpx.Response]], None]


def fake(
    answer: Callable[[dict], str],
) -> tuple[list[dict], Callable[[httpx.Request], httpx.Response]]:
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        return chat_response(answer(body))

    return calls, handler


def categories(client: TestClient) -> list[dict]:
    return client.get("/api/categories").json()


def test_create_send_and_read_history(client: TestClient, mock_ollama: Install) -> None:
    trip = create_note(client, "Trip", "Flight is on Monday.")
    calls, handler = fake(lambda body: f"On Monday [note:{trip['id']}] [note:999].")
    mock_ollama(handler)
    chat = client.post("/api/chats", json={}).json()

    reply = client.post(f"/api/chats/{chat['id']}/messages", json={"content": "When is my flight?"})

    assert reply.status_code == 201
    body = reply.json()
    assert body["conversation"]["title"] == "When is my flight?"
    assert body["user_message"]["role"] == "user"
    assistant = body["assistant_message"]
    assert assistant["content"].startswith("On Monday")
    assert assistant["sources"] == [
        {"id": trip["id"], "title": "Trip", "kind": "note", "url": f"/notes/{trip['id']}"}
    ]
    assert assistant["cited_note_ids"] == [trip["id"]]  # the invented id 999 is dropped
    assert assistant["partial"] is False
    assert "Flight is on Monday." in calls[0]["messages"][-1]["content"]

    stored = client.get(f"/api/chats/{chat['id']}").json()
    assert [m["role"] for m in stored["messages"]] == ["user", "assistant"]
    assert [c["id"] for c in client.get("/api/chats").json()] == [chat["id"]]


def test_follow_up_questions_include_history(client: TestClient, mock_ollama: Install) -> None:
    create_note(client, "Trip", "Flight is on Monday. Hotel is Zandiyeh.")
    calls, handler = fake(lambda body: "Answer.")
    mock_ollama(handler)
    chat = client.post("/api/chats", json={}).json()

    client.post(f"/api/chats/{chat['id']}/messages", json={"content": "When is the flight?"})
    client.post(f"/api/chats/{chat['id']}/messages", json={"content": "And the hotel?"})

    second = calls[1]["messages"]
    assert [m["role"] for m in second] == ["system", "user", "assistant", "user"]
    assert second[1]["content"] == "When is the flight?"
    assert second[3]["content"].endswith("Question: And the hotel?")


def test_scope_limits_which_notes_are_read(client: TestClient, mock_ollama: Install) -> None:
    english, shopping, _ = categories(client)
    create_note(client, "Words", "Vocabulary list", category_id=english["id"])
    create_note(client, "Groceries", "Milk and eggs", category_id=shopping["id"])
    create_note(client, "Loose", "Uncategorized thought")
    calls, handler = fake(lambda body: "ok")
    mock_ollama(handler)

    chat = client.post(
        "/api/chats",
        json={"scope": {"category_ids": [shopping["id"]], "include_uncategorized": False}},
    ).json()
    client.post(f"/api/chats/{chat['id']}/messages", json={"content": "What do I buy?"})
    prompt = calls[0]["messages"][-1]["content"]
    assert "Milk and eggs" in prompt
    assert "Vocabulary" not in prompt and "Uncategorized" not in prompt

    # The scope can be changed with the next message, and is remembered.
    client.post(
        f"/api/chats/{chat['id']}/messages",
        json={"content": "And words?", "scope": {"category_ids": None}},
    )
    prompt = calls[1]["messages"][-1]["content"]
    assert "Vocabulary" in prompt and "Uncategorized" in prompt
    assert client.get(f"/api/chats/{chat['id']}").json()["scope"]["category_ids"] is None


def test_general_questions_are_answered_without_notes(
    client: TestClient, mock_ollama: Install
) -> None:
    calls, handler = fake(lambda body: "Paris is the capital of France.")
    mock_ollama(handler)
    chat = client.post("/api/chats", json={}).json()

    response = client.post(
        f"/api/chats/{chat['id']}/messages", json={"content": "What is the capital of France?"}
    )

    assert response.status_code == 201
    assert response.json()["assistant_message"]["content"] == "Paris is the capital of France."
    assert response.json()["assistant_message"]["sources"] == []
    assert len(calls) == 1
    assert "general knowledge" in json.dumps(calls[0])


def test_failed_answer_keeps_history_unchanged(client: TestClient, mock_ollama: Install) -> None:
    create_note(client, "Trip", "x")

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    mock_ollama(down)
    chat = client.post("/api/chats", json={}).json()
    response = client.post(f"/api/chats/{chat['id']}/messages", json={"content": "Hi?"})

    assert response.status_code == 503
    assert client.get(f"/api/chats/{chat['id']}").json()["messages"] == []


def test_large_note_collection_is_marked_partial(client: TestClient, mock_ollama: Install) -> None:
    for i in range(5):
        create_note(client, f"Note {i}", "filler sentence " * 60)
    create_note(client, "Bank", "The bank code is 4711.")
    calls, handler = fake(lambda body: "4711")
    mock_ollama(handler)
    chat = client.post("/api/chats", json={}).json()

    reply = client.post(
        f"/api/chats/{chat['id']}/messages", json={"content": "What is the bank code?"}
    ).json()

    assert reply["assistant_message"]["partial"] is True
    assert "4711" in calls[0]["messages"][-1]["content"]


def test_rename_delete_and_isolation(client: TestClient, anon: TestClient) -> None:
    chat = client.post("/api/chats", json={"title": "Old"}).json()
    assert client.patch(f"/api/chats/{chat['id']}", json={"title": "New"}).json()["title"] == "New"

    other = register(anon, "other@example.com")
    assert anon.get(f"/api/chats/{chat['id']}", headers=other).status_code == 404

    assert client.delete(f"/api/chats/{chat['id']}").status_code == 204
    assert client.get(f"/api/chats/{chat['id']}").json()["code"] == "chat_not_found"
