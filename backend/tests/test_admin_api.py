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


def test_stats(client: TestClient) -> None:
    client.post("/api/notes", json={"title": "x"})
    stats = client.get("/api/admin/stats").json()
    assert stats["users"] == 1
    assert stats["notes"] == 1
    assert stats["email_enabled"] is False


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
