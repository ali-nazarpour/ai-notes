"""Workspaces, roles, invitations and sharing single items."""

import re

import pytest
from fastapi.testclient import TestClient

from app.services import mailer
from tests.conftest import register


def ws(workspace_id: int) -> dict[str, str]:
    return {"X-Workspace-Id": str(workspace_id)}


def test_personal_workspace_is_created_and_used_by_default(client: TestClient) -> None:
    spaces = client.get("/api/workspaces").json()
    assert len(spaces) == 1
    assert spaces[0]["role"] == "owner"
    note = client.post("/api/notes", json={"title": "Hi"}).json()
    assert note["workspace_id"] == spaces[0]["id"]
    assert client.get("/api/workspaces/current").json()["id"] == spaces[0]["id"]


def test_workspaces_keep_data_apart(client: TestClient) -> None:
    second = client.post("/api/workspaces", json={"name": "Work", "icon": "💼"}).json()
    assert second["role"] == "owner"
    client.post("/api/notes", json={"title": "Personal note"})
    client.post("/api/notes", json={"title": "Work note"}, headers=ws(second["id"]))

    personal = [n["title"] for n in client.get("/api/notes").json()]
    work = [n["title"] for n in client.get("/api/notes", headers=ws(second["id"])).json()]
    assert personal == ["Personal note"]
    assert work == ["Work note"]
    # New workspaces get their own default categories.
    assert len(client.get("/api/categories", headers=ws(second["id"])).json()) == 3


def test_unknown_workspace_header_is_404(client: TestClient) -> None:
    response = client.get("/api/notes", headers=ws(999))
    assert response.status_code == 404
    assert response.json()["code"] == "workspace_not_found"


def test_workspace_settings_and_theme(client: TestClient) -> None:
    response = client.patch(
        "/api/workspaces/current",
        json={"name": "Home", "accent_color": "teal", "settings": {"blog_public": True}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["accent_color"] == "teal"
    assert body["settings"]["blog_public"] is True
    assert body["settings"]["ai_enabled"] is True


def test_cannot_delete_only_workspace(client: TestClient) -> None:
    response = client.delete("/api/workspaces/current")
    assert response.json()["code"] == "last_workspace"
    second = client.post("/api/workspaces", json={"name": "Temp"}).json()
    assert client.delete("/api/workspaces/current", headers=ws(second["id"])).status_code == 204


def _invite(client: TestClient, email: str, role: str = "editor") -> dict:
    response = client.post("/api/workspaces/current/invites", json={"email": email, "role": role})
    assert response.status_code == 201, response.text
    return response.json()


def test_invite_accept_and_roles(anon: TestClient) -> None:
    owner = register(anon, "owner@example.com")
    owner_client = TestClient(anon.app, headers=owner)
    workspace_id = owner_client.get("/api/workspaces/current").json()["id"]
    invite = _invite(owner_client, "viewer@example.com", "viewer")
    assert invite["email_status"] == "skipped"  # email service not configured
    token = invite["link"].rsplit("/", 1)[-1]

    # The link works without signing in (preview) ...
    assert anon.get(f"/api/invites/preview/{token}").json()["workspace_id"] == workspace_id
    # ... and only for the invited address.
    other = register(anon, "other@example.com")
    wrong = anon.post("/api/invites/accept", json={"token": token}, headers=other)
    assert wrong.json()["code"] == "invite_other_email"

    viewer = register(anon, "viewer@example.com")
    assert len(anon.get("/api/invites", headers=viewer).json()) == 1
    accepted = anon.post("/api/invites/accept", json={"token": token}, headers=viewer)
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "viewer"

    owner_client.post("/api/notes", json={"title": "Team plan"})
    as_viewer = {**viewer, **ws(workspace_id)}
    notes = anon.get("/api/notes", headers=as_viewer).json()
    assert [n["title"] for n in notes] == ["Team plan"]
    note_id = notes[0]["id"]
    assert anon.get(f"/api/notes/{note_id}", headers=as_viewer).json()["role"] == "viewer"
    # Viewers cannot change anything.
    denied = anon.patch(f"/api/notes/{note_id}", json={"title": "x"}, headers=as_viewer)
    assert denied.status_code == 403
    assert denied.json()["code"] == "read_only"
    assert anon.post("/api/notes", json={}, headers=as_viewer).status_code == 403
    assert anon.post("/api/tasks", json={"title": "x"}, headers=as_viewer).status_code == 403

    members = owner_client.get("/api/workspaces/current/members").json()
    assert {m["email"]: m["role"] for m in members} == {
        "owner@example.com": "owner",
        "viewer@example.com": "viewer",
    }
    viewer_member = next(m for m in members if m["role"] == "viewer")
    owner_client.patch(
        f"/api/workspaces/current/members/{viewer_member['id']}", json={"role": "editor"}
    )
    assert (
        anon.patch(f"/api/notes/{note_id}", json={"title": "Edited"}, headers=as_viewer).status_code
        == 200
    )

    # A member can leave; then the workspace is gone for them.
    left = anon.delete(f"/api/workspaces/current/members/{viewer_member['id']}", headers=as_viewer)
    assert left.status_code == 204
    assert anon.get("/api/notes", headers=as_viewer).status_code == 404


def test_only_admins_invite(anon: TestClient) -> None:
    owner = register(anon, "owner@example.com")
    owner_client = TestClient(anon.app, headers=owner)
    workspace_id = owner_client.get("/api/workspaces/current").json()["id"]
    token = _invite(owner_client, "ed@example.com")["link"].rsplit("/", 1)[-1]
    editor = register(anon, "ed@example.com")
    anon.post("/api/invites/accept", json={"token": token}, headers=editor)
    response = anon.post(
        "/api/workspaces/current/invites",
        json={"email": "x@example.com"},
        headers={**editor, **ws(workspace_id)},
    )
    assert response.json()["code"] == "workspace_admin_only"
    again = owner_client.post("/api/workspaces/current/invites", json={"email": "ed@example.com"})
    assert again.json()["code"] == "already_member"


def test_share_a_note_with_one_person(anon: TestClient) -> None:
    alice = register(anon, "alice@example.com")
    bob = register(anon, "bob@example.com")
    note = anon.post("/api/notes", json={"title": "Recipe"}, headers=alice).json()
    assert anon.get(f"/api/notes/{note['id']}", headers=bob).status_code == 404

    missing = anon.post(
        "/api/shares",
        json={"kind": "note", "item_id": note["id"], "email": "nobody@example.com"},
        headers=alice,
    )
    assert missing.json()["code"] == "user_not_found"
    share = anon.post(
        "/api/shares",
        json={"kind": "note", "item_id": note["id"], "email": "bob@example.com", "role": "viewer"},
        headers=alice,
    )
    assert share.status_code == 201

    opened = anon.get(f"/api/notes/{note['id']}", headers=bob).json()
    assert opened["shared"] is True
    assert opened["role"] == "viewer"
    assert (
        anon.patch(f"/api/notes/{note['id']}", json={"title": "x"}, headers=bob).status_code == 403
    )
    shared = anon.get("/api/shares/with-me", headers=bob).json()
    assert shared[0]["title"] == "Recipe"
    assert shared[0]["url"] == f"/notes/{note['id']}"
    # The note does not appear in Bob's own lists.
    assert anon.get("/api/notes", headers=bob).json() == []

    anon.patch(f"/api/shares/{share.json()['id']}", json={"role": "editor"}, headers=alice)
    assert (
        anon.patch(f"/api/notes/{note['id']}", json={"title": "Soup"}, headers=bob).status_code
        == 200
    )
    # Bob removes it from his list.
    assert anon.delete(f"/api/shares/{share.json()['id']}", headers=bob).status_code == 204
    assert anon.get(f"/api/notes/{note['id']}", headers=bob).status_code == 404


def test_share_board_and_list_shares(anon: TestClient) -> None:
    alice = register(anon, "alice@example.com")
    register(anon, "bob@example.com")
    board = anon.post("/api/boards", json={"title": "Launch"}, headers=alice).json()
    anon.post(
        "/api/shares",
        json={"kind": "board", "item_id": board["id"], "email": "bob@example.com"},
        headers=alice,
    )
    shares = anon.get(f"/api/shares?kind=board&item_id={board['id']}", headers=alice).json()
    assert [s["email"] for s in shares] == ["bob@example.com"]


def test_invite_email_is_sent_when_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list = []
    monkeypatch.setattr(
        mailer, "deliver", lambda config, message, timeout=20.0: sent.append(message)
    )
    admin = client.put(
        "/api/admin/settings/email",
        json={
            "enabled": True,
            "host": "smtp.gmail.com",
            "port": 587,
            "username": "me@gmail.com",
            "password": "app password",
            "from_email": "me@gmail.com",
        },
    )
    assert admin.status_code == 200
    invite = _invite(client, "friend@example.com")
    assert invite["email_status"] == "sent"
    assert sent[0]["To"] == "friend@example.com"
    body = sent[0].get_body(("plain",)).get_content()
    assert re.search(r"/invite/[\w-]+", body)
