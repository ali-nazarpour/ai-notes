"""Admin panel, email settings, password reset and sign-up rules."""

import re

import pytest
from fastapi.testclient import TestClient

from app.services import mailer
from tests.conftest import PASSWORD, register

GMAIL = {
    "enabled": True,
    "host": "smtp.gmail.com",
    "port": 587,
    "security": "starttls",
    "username": "me@gmail.com",
    "password": "abcd efgh ijkl mnop",
    "from_email": "me@gmail.com",
    "from_name": "Notes",
}


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list:
    sent: list = []
    monkeypatch.setattr(
        mailer, "deliver", lambda config, message, timeout=20.0: sent.append(message)
    )
    return sent


def test_first_user_is_admin_and_others_are_not(anon: TestClient) -> None:
    first = register(anon, "first@example.com")
    second = register(anon, "second@example.com")
    assert anon.get("/api/auth/me", headers=first).json()["is_admin"] is True
    assert anon.get("/api/auth/me", headers=second).json()["is_admin"] is False
    denied = anon.get("/api/admin/users", headers=second)
    assert denied.status_code == 403
    assert denied.json()["code"] == "admin_only"
    users = anon.get("/api/admin/users", headers=first).json()
    assert [u["email"] for u in users] == ["first@example.com", "second@example.com"]


def test_standalone_admin_sign_in(anon: TestClient) -> None:
    app_session = register(anon, "admin@example.com")
    member = register(anon, "member@example.com")
    path = "/api/admin/auth/login"
    denied = anon.post(path, json={"email": "member@example.com", "password": PASSWORD})
    assert denied.status_code == 403 and denied.json()["code"] == "admin_only"
    assert anon.get("/api/admin/auth/me", headers=member).status_code == 403
    assert anon.get("/api/admin/auth/me").status_code == 401
    assert len(anon.get("/api/auth/sessions", headers=member).json()) == 1
    assert (
        anon.post(
            path, json={"email": "admin@example.com", "password": "wrong password"}
        ).status_code
        == 401
    )
    signed_in = anon.post(path, json={"email": "admin@example.com", "password": PASSWORD})
    assert signed_in.status_code == 200 and signed_in.json()["user"]["is_admin"]
    admin_session = {"Authorization": f"Bearer {signed_in.json()['token']}"}
    assert admin_session != app_session
    assert anon.get("/api/admin/auth/me", headers=admin_session).status_code == 200
    assert anon.post("/api/auth/logout", headers=admin_session).status_code == 204
    assert anon.get("/api/admin/auth/me", headers=admin_session).status_code == 401
    assert anon.get("/api/auth/me", headers=app_session).status_code == 200


def test_stats(client: TestClient) -> None:
    client.post("/api/notes", json={"title": "x"})
    stats = client.get("/api/admin/stats").json()
    assert stats["users"] == 1
    assert stats["notes"] == 1
    assert stats["email_enabled"] is False


def test_user_directory_provisioning_and_workspace_lookup(anon: TestClient) -> None:
    admin = register(anon, "admin@example.com")
    member = register(anon, "existing@example.com")
    anon.put("/api/admin/settings/general", json={"allow_registration": False}, headers=admin)
    payload = {
        "email": " NEW@example.com ",
        "password": PASSWORD,
        "display_name": " New Member ",
        "language": "fa",
    }
    assert anon.post("/api/admin/users", json=payload, headers=member).status_code == 403
    created = anon.post("/api/admin/users", json=payload, headers=admin)
    assert created.status_code == 201
    user = created.json()
    assert (user["email"], user["name"], user["language"], user["is_admin"]) == (
        "new@example.com",
        "New Member",
        "fa",
        False,
    )
    assert "token" not in user and "password_hash" not in user
    assert (
        anon.post("/api/admin/users", json=payload, headers=admin).json()["code"] == "email_taken"
    )

    directory = anon.get(
        "/api/admin/users/directory?role=member&state=active&sort=email&limit=1&page=2",
        headers=admin,
    ).json()
    assert directory["total"] == 2
    assert directory["all_users"] == 3
    assert directory["admins"] == 1
    assert [row["id"] for row in directory["items"]] == [user["id"]]
    detail = anon.get(f"/api/admin/users/{user['id']}", headers=admin).json()
    assert detail["sessions"] == []
    assert detail["memberships"][0]["role"] == "owner"

    assert anon.get("/api/admin/workspaces", headers=member).status_code == 403
    spaces = anon.get("/api/admin/workspaces?search=new%40example.com", headers=admin).json()
    assert spaces["total"] == 1
    assert spaces["items"][0]["owner_id"] == user["id"]
    assert spaces["items"][0]["member_count"] == 1


def test_admin_profile_changes_and_session_revocation(anon: TestClient) -> None:
    admin = register(anon, "admin@example.com")
    member = register(anon, "member@example.com")
    new_session = anon.post(
        "/api/auth/login", json={"email": "member@example.com", "password": PASSWORD}
    ).json()["token"]
    member_id = anon.get("/api/auth/me", headers=member).json()["id"]
    path = f"/api/admin/users/{member_id}"
    assert anon.get(path, headers=member).status_code == 403
    sessions = anon.get(path, headers=admin).json()["sessions"]
    assert len(sessions) == 2 and all("token_hash" not in session for session in sessions)
    assert anon.delete(f"{path}/sessions/{sessions[0]['id']}", headers=admin).status_code == 204
    assert (
        anon.get("/api/auth/me", headers={"Authorization": f"Bearer {new_session}"}).status_code
        == 401
    )

    assert anon.patch(path, json={"email": "admin@example.com"}, headers=admin).status_code == 409
    link = anon.post(f"{path}/reset-link", headers=admin).json()["link"]
    assert (
        anon.patch(
            path, json={"email": "updated@example.com", "display_name": "Updated"}, headers=admin
        ).status_code
        == 204
    )
    assert anon.get("/api/auth/me", headers=member).status_code == 401
    token = link.rsplit("=", 1)[-1]
    expired = anon.post("/api/auth/reset-password", json={"token": token, "new_password": PASSWORD})
    assert expired.json()["code"] == "reset_link_invalid"
    login = anon.post(
        "/api/auth/login", json={"email": "updated@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200
    assert login.json()["user"]["display_name"] == "Updated"
    assert anon.delete(f"{path}/sessions", headers=admin).status_code == 204
    assert anon.get(path, headers=admin).json()["sessions"] == []


def test_admin_manages_workspace_for_another_user(anon: TestClient) -> None:
    admin = register(anon, "admin@example.com")
    owner = register(anon, "owner@example.com")
    original = anon.get("/api/workspaces/current", headers=owner).json()["id"]
    body = {
        "name": "Project Group",
        "description": "Shared plan",
        "owner_email": "owner@example.com",
    }
    path = "/api/admin/workspaces"
    assert anon.post(path, json=body, headers=owner).status_code == 403
    assert (
        anon.post(
            path, json={**body, "owner_email": "missing@example.com"}, headers=admin
        ).status_code
        == 404
    )
    created = anon.post(path, json=body, headers=admin)
    assert created.status_code == 201
    workspace = created.json()
    assert workspace["owner_email"] == "owner@example.com"
    assert workspace["member_count"] == 1
    assert not workspace["only_owned_workspace"]
    detail_path = f"{path}/{workspace['id']}"
    headers = {**owner, "X-Workspace-Id": str(workspace["id"])}
    assert (
        anon.post("/api/notes", json={"title": "Project note"}, headers=headers).status_code == 201
    )
    assert anon.get(detail_path, headers=admin).json()["description"] == "Shared plan"
    assert anon.patch(detail_path, json={"name": "Blocked"}, headers=owner).status_code == 403
    edited = anon.patch(
        detail_path,
        json={"name": "Final Project", "icon": "🚀", "settings": {"ai_enabled": False}},
        headers=admin,
    )
    assert edited.status_code == 200
    assert edited.json()["slug"] == workspace["slug"]
    current = anon.get("/api/workspaces/current", headers=headers).json()
    assert current["name"] == "Final Project"
    assert current["icon"] == "🚀" and not current["settings"]["ai_enabled"]

    listing = anon.get(f"{path}?search=Final+Project&members=solo&sort=name", headers=admin).json()
    assert listing["total"] == len(listing["items"]) == 1
    assert listing["all_workspaces"] == listing["solo"] == 3
    assert listing["team"] == 0
    invite = anon.post(
        "/api/workspaces/current/invites", json={"email": "admin@example.com"}, headers=headers
    ).json()
    token = invite["link"].rsplit("/", 1)[-1]
    assert anon.post("/api/invites/accept", json={"token": token}, headers=admin).status_code == 200
    teams = anon.get(f"{path}?members=team&sort=members", headers=admin).json()
    assert teams["total"] == teams["team"] == 1
    assert teams["items"][0]["id"] == workspace["id"]
    assert teams["items"][0]["member_count"] == 2
    assert anon.delete(detail_path, headers=owner).status_code == 403
    assert anon.delete(detail_path, headers=admin).status_code == 204
    assert anon.get(detail_path, headers=admin).status_code == 404
    assert anon.get("/api/notes", headers=headers).status_code == 404
    assert [row["id"] for row in anon.get("/api/workspaces", headers=owner).json()] == [original]


def test_admin_replaces_last_owned_workspace_on_delete(anon: TestClient) -> None:
    admin = register(anon, "admin@example.com")
    owner = register(anon, "owner@example.com", language="fa")
    original = anon.get("/api/workspaces/current", headers=owner).json()["id"]
    anon.post("/api/notes", json={"title": "Old note"}, headers=owner)
    assert anon.delete("/api/workspaces/current", headers=owner).json()["code"] == "last_workspace"
    path = f"/api/admin/workspaces/{original}"
    assert anon.get(path, headers=admin).json()["only_owned_workspace"]
    assert anon.delete(path, headers=admin).status_code == 204
    spaces = anon.get("/api/workspaces", headers=owner).json()
    assert len(spaces) == 1 and spaces[0]["id"] != original
    assert spaces[0]["name"] == "فضای شخصی" and spaces[0]["role"] == "owner"
    assert anon.get("/api/notes", headers=owner).json() == []


def test_smtp_password_is_write_only_and_encrypted(client: TestClient, db_factory) -> None:  # type: ignore[no-untyped-def]
    saved = client.put("/api/admin/settings/email", json=GMAIL).json()
    assert saved["password_set"] is True
    assert "password" not in saved
    with db_factory() as db:
        stored = mailer.get_setting(db, "smtp")
    assert stored["password"] != GMAIL["password"]
    # Saving without a password keeps the old one.
    again = client.put("/api/admin/settings/email", json={**GMAIL, "password": None}).json()
    assert again["password_set"] is True
    assert client.get("/api/auth/config").json()["email_enabled"] is True


def test_test_email_reports_errors(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    client.put("/api/admin/settings/email", json=GMAIL)

    def fail(config, message, timeout=20.0):  # type: ignore[no-untyped-def]
        import smtplib

        raise smtplib.SMTPAuthenticationError(535, b"bad credentials")

    monkeypatch.setattr(mailer, "deliver", fail)
    result = client.post("/api/admin/settings/email/test", json={"to": "x@example.com"}).json()
    assert result["status"] == "failed"
    assert "app password" in result["error"]
    log = client.get("/api/admin/emails").json()
    assert log[0]["status"] == "failed"


def test_password_reset_flow(anon: TestClient, outbox: list) -> None:
    admin = register(anon, "admin@example.com")
    anon.put("/api/admin/settings/email", json=GMAIL, headers=admin)
    user = register(anon, "user@example.com")

    # Same answer for unknown addresses.
    assert anon.post("/api/auth/forgot-password", json={"email": "nobody@x.com"}).status_code == 202
    assert (
        anon.post("/api/auth/forgot-password", json={"email": "user@example.com"}).status_code
        == 202
    )
    assert len(outbox) == 1
    text = outbox[0].get_body(("plain",)).get_content()
    token = re.search(r"token=([\w-]+)", text).group(1)  # type: ignore[union-attr]

    assert (
        anon.post(
            "/api/auth/reset-password", json={"token": token, "new_password": "short"}
        ).status_code
        == 422
    )
    done = anon.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brand new pass"}
    )
    assert done.status_code == 204
    # Old sessions are signed out; the link works only once.
    assert anon.get("/api/auth/me", headers=user).status_code == 401
    again = anon.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "another pass1"}
    )
    assert again.json()["code"] == "reset_link_invalid"
    login = anon.post(
        "/api/auth/login", json={"email": "user@example.com", "password": "brand new pass"}
    )
    assert login.status_code == 200


def test_disable_user_and_admin_safety(anon: TestClient) -> None:
    admin = register(anon, "admin@example.com")
    user = register(anon, "user@example.com")
    user_id = anon.get("/api/auth/me", headers=user).json()["id"]
    admin_id = anon.get("/api/auth/me", headers=admin).json()["id"]

    assert (
        anon.patch(f"/api/admin/users/{admin_id}", json={"is_active": False}, headers=admin).json()[
            "code"
        ]
        == "admin_self"
    )
    assert (
        anon.patch(
            f"/api/admin/users/{user_id}", json={"is_active": False}, headers=admin
        ).status_code
        == 204
    )
    assert anon.get("/api/auth/me", headers=user).status_code == 401
    login = anon.post("/api/auth/login", json={"email": "user@example.com", "password": PASSWORD})
    assert login.json()["code"] == "account_disabled"

    link = anon.post(f"/api/admin/users/{user_id}/reset-link", headers=admin).json()
    assert "/reset-password?token=" in link["link"]
    assert anon.delete(f"/api/admin/users/{user_id}", headers=admin).status_code == 204
    assert len(anon.get("/api/admin/users", headers=admin).json()) == 1


def test_closed_registration_allows_invited_people(anon: TestClient) -> None:
    admin = register(anon, "admin@example.com")
    anon.put(
        "/api/admin/settings/general",
        json={"app_name": "Team", "app_url": "http://localhost:5173", "allow_registration": False},
        headers=admin,
    )
    assert anon.get("/api/auth/config").json() == {
        "app_name": "Team",
        "allow_registration": False,
        "email_enabled": False,
    }
    closed = anon.post(
        "/api/auth/register", json={"email": "new@example.com", "password": PASSWORD}
    )
    assert closed.json()["code"] == "registration_closed"

    invite = anon.post(
        "/api/workspaces/current/invites", json={"email": "new@example.com"}, headers=admin
    ).json()
    token = invite["link"].rsplit("/", 1)[-1]
    assert invite["link"].startswith("http://localhost:5173/invite/")
    ok = anon.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": PASSWORD, "invite_token": token},
    )
    assert ok.status_code == 201


def test_deleting_member_keeps_their_work_in_shared_workspace(anon: TestClient) -> None:
    owner = register(anon, "owner@example.com")
    owner_ws = anon.get("/api/workspaces/current", headers=owner).json()["id"]
    token = (
        anon.post("/api/workspaces/current/invites", json={"email": "m@example.com"}, headers=owner)
        .json()["link"]
        .rsplit("/", 1)[-1]
    )
    member = register(anon, "m@example.com")
    anon.post("/api/invites/accept", json={"token": token}, headers=member)
    anon.post(
        "/api/notes",
        json={"title": "Team doc"},
        headers={**member, "X-Workspace-Id": str(owner_ws)},
    )

    anon.post("/api/auth/delete-account", json={"password": PASSWORD}, headers=member)
    titles = [n["title"] for n in anon.get("/api/notes", headers=owner).json()]
    assert titles == ["Team doc"]
