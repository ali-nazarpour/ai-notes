"""Profile details, avatar, email change and sessions."""

from fastapi.testclient import TestClient

from tests.conftest import PASSWORD, register
from tests.test_files_api import MP4, PNG, upload


def test_profile_fields_round_trip(client: TestClient) -> None:
    response = client.patch(
        "/api/auth/me",
        json={
            "first_name": "  Sara ",
            "last_name": "Ahmadi",
            "birth_date": "1995-03-21",
            "phone": "+98 912 000 0000",
            "address": "Tehran",
            "bio": "Hello",
        },
    )
    assert response.status_code == 200, response.text
    user = response.json()
    assert user["first_name"] == "Sara"
    assert user["birth_date"] == "1995-03-21"
    assert client.get("/api/auth/me").json()["phone"] == "+98 912 000 0000"


def test_profile_validation(client: TestClient) -> None:
    assert client.patch("/api/auth/me", json={"phone": "call me"}).status_code == 422
    assert client.patch("/api/auth/me", json={"birth_date": "2999-01-01"}).status_code == 422
    assert client.patch("/api/auth/me", json={"first_name": None}).status_code == 422
    assert client.patch("/api/auth/me", json={"avatar": "https://evil/x.png"}).status_code == 422


def test_avatar_must_be_own_uploaded_image(client: TestClient, anon: TestClient) -> None:
    image = upload(client, PNG, "me.png").json()
    video = upload(client, MP4, "clip.mp4").json()
    assert (
        client.patch("/api/auth/me", json={"avatar": image["url"]}).json()["avatar"] == image["url"]
    )
    assert client.patch("/api/auth/me", json={"avatar": video["url"]}).status_code == 422

    other = TestClient(client.app, headers=register(anon, "other@example.com"))
    assert other.patch("/api/auth/me", json={"avatar": image["url"]}).status_code == 422
    assert client.patch("/api/auth/me", json={"avatar": None}).json()["avatar"] is None


def test_email_change_needs_password_and_free_address(client: TestClient, anon: TestClient) -> None:
    register(anon, "taken@example.com")
    assert client.patch("/api/auth/me", json={"email": "new@example.com"}).status_code == 422
    wrong = client.patch(
        "/api/auth/me", json={"email": "new@example.com", "current_password": "nope"}
    )
    assert wrong.json()["code"] == "wrong_password"
    taken = client.patch(
        "/api/auth/me", json={"email": "Taken@example.com", "current_password": PASSWORD}
    )
    assert taken.status_code == 409
    ok = client.patch(
        "/api/auth/me", json={"email": "New@Example.com", "current_password": PASSWORD}
    )
    assert ok.json()["email"] == "new@example.com"
    login = anon.post("/api/auth/login", json={"email": "new@example.com", "password": PASSWORD})
    assert login.status_code == 200


def test_sessions_list_and_revoke(anon: TestClient) -> None:
    first = TestClient(anon.app, headers=register(anon, "me@example.com"))
    token = anon.post(
        "/api/auth/login",
        json={"email": "me@example.com", "password": PASSWORD},
        headers={"User-Agent": "PhoneBrowser/1.0"},
    ).json()["token"]
    second = TestClient(anon.app, headers={"Authorization": f"Bearer {token}"})

    sessions = first.get("/api/auth/sessions").json()
    assert len(sessions) == 2
    assert [s["current"] for s in sessions].count(True) == 1
    phone = next(s for s in sessions if s["user_agent"] == "PhoneBrowser/1.0")

    assert first.delete(f"/api/auth/sessions/{phone['id']}").status_code == 204
    assert second.get("/api/auth/me").status_code == 401
    assert first.get("/api/auth/me").status_code == 200


def test_revoke_other_sessions(anon: TestClient) -> None:
    first = TestClient(anon.app, headers=register(anon, "me@example.com"))
    token = anon.post(
        "/api/auth/login", json={"email": "me@example.com", "password": PASSWORD}
    ).json()["token"]
    assert first.post("/api/auth/sessions/revoke-others").status_code == 204
    assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert len(first.get("/api/auth/sessions").json()) == 1


def test_cannot_revoke_someone_elses_session(anon: TestClient) -> None:
    mine = TestClient(anon.app, headers=register(anon, "a@example.com"))
    theirs = TestClient(anon.app, headers=register(anon, "b@example.com"))
    their_id = theirs.get("/api/auth/sessions").json()[0]["id"]
    assert mine.delete(f"/api/auth/sessions/{their_id}").status_code == 404
