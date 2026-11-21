"""Accounts: register, login, sessions, profile, passwords, isolation between accounts."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.security import hash_password, verify_password
from app.models import Note
from app.storage import MemoryStorage
from tests.conftest import PASSWORD, register


def test_password_hash_is_salted_and_verifiable() -> None:
    first, second = hash_password("secret pass"), hash_password("secret pass")
    assert first != second
    assert "secret pass" not in first
    assert verify_password("secret pass", first)
    assert not verify_password("wrong pass", first)
    assert not verify_password("secret pass", "garbage")


def test_register_returns_token_user_and_default_categories(anon: TestClient) -> None:
    response = anon.post(
        "/api/auth/register",
        json={"email": "  Ali@Example.COM ", "password": PASSWORD, "display_name": " Ali "},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "ali@example.com"
    assert body["user"]["display_name"] == "Ali"
    assert body["user"]["language"] == "en"
    assert "password_hash" not in body["user"]

    headers = {"Authorization": f"Bearer {body['token']}"}
    names = [c["name"] for c in anon.get("/api/categories", headers=headers).json()]
    assert names == ["English learning", "Daily shopping", "Today's tasks"]


def test_persian_account_gets_persian_default_categories(anon: TestClient) -> None:
    headers = register(anon, "sara@example.com", language="fa")
    names = [c["name"] for c in anon.get("/api/categories", headers=headers).json()]
    assert names == ["یادگیری زبان انگلیسی", "خریدهای روزانه", "کارهای امروز"]
    assert anon.get("/api/auth/me", headers=headers).json()["language"] == "fa"


def test_register_same_email_twice_returns_409_with_code(anon: TestClient) -> None:
    register(anon, "ali@example.com")
    response = anon.post(
        "/api/auth/register", json={"email": "ALI@example.com", "password": PASSWORD}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


def test_register_validation(anon: TestClient) -> None:
    bad_email = anon.post("/api/auth/register", json={"email": "nope", "password": PASSWORD})
    short = anon.post("/api/auth/register", json={"email": "a@b.co", "password": "short"})
    language = anon.post(
        "/api/auth/register", json={"email": "a@b.co", "password": PASSWORD, "language": "xx"}
    )
    assert {bad_email.status_code, short.status_code, language.status_code} == {422}
    assert bad_email.json()["code"] == "validation_error"


def test_first_account_adopts_notes_from_before_accounts(
    anon: TestClient, db_factory: sessionmaker[Session]
) -> None:
    with db_factory() as db:
        db.add(Note(title="Old note", content="Written before accounts"))
        db.commit()
    first = register(anon, "first@example.com")
    second = register(anon, "second@example.com")
    assert [n["title"] for n in anon.get("/api/notes", headers=first).json()] == ["Old note"]
    assert anon.get("/api/notes", headers=second).json() == []


def test_login_and_failures(anon: TestClient) -> None:
    register(anon, "ali@example.com")
    ok = anon.post("/api/auth/login", json={"email": "Ali@Example.com", "password": PASSWORD})
    wrong = anon.post("/api/auth/login", json={"email": "ali@example.com", "password": "nope!"})
    unknown = anon.post("/api/auth/login", json={"email": "x@example.com", "password": PASSWORD})

    assert ok.status_code == 200
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["code"] == "invalid_credentials"


def test_protected_routes_need_a_valid_token(anon: TestClient) -> None:
    for path in ("/api/notes", "/api/tasks", "/api/chats", "/api/categories"):
        assert anon.get(path).status_code == 401
    response = anon.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"
    assert response.headers["www-authenticate"] == "Bearer"


def test_logout_revokes_only_that_token(anon: TestClient) -> None:
    first = register(anon, "ali@example.com")
    login = anon.post("/api/auth/login", json={"email": "ali@example.com", "password": PASSWORD})
    second = {"Authorization": f"Bearer {login.json()['token']}"}

    assert anon.post("/api/auth/logout", headers=first).status_code == 204
    assert anon.get("/api/auth/me", headers=first).status_code == 401
    assert anon.get("/api/auth/me", headers=second).status_code == 200


def test_patch_me(client: TestClient) -> None:
    body = client.patch(
        "/api/auth/me", json={"theme": "dark", "accent_color": "pink", "language": "fa"}
    ).json()
    assert (body["theme"], body["accent_color"], body["language"]) == ("dark", "pink", "fa")
    assert client.patch("/api/auth/me", json={"accent_color": "gold"}).status_code == 422
    assert client.patch("/api/auth/me", json={"language": None}).status_code == 422


def test_change_password_signs_out_other_sessions(anon: TestClient) -> None:
    current = register(anon, "ali@example.com")
    other = anon.post("/api/auth/login", json={"email": "ali@example.com", "password": PASSWORD})
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}

    wrong = anon.post(
        "/api/auth/change-password",
        json={"current_password": "wrong one", "new_password": "brand new pass"},
        headers=current,
    )
    assert wrong.status_code == 422
    assert wrong.json()["code"] == "wrong_password"

    response = anon.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "brand new pass"},
        headers=current,
    )
    assert response.status_code == 204
    assert anon.get("/api/auth/me", headers=current).status_code == 200
    assert anon.get("/api/auth/me", headers=other_headers).status_code == 401


def test_delete_account_removes_data_and_files(
    anon: TestClient, db_factory: sessionmaker[Session], storage: MemoryStorage
) -> None:
    headers = register(anon, "ali@example.com")
    anon.post("/api/notes", json={"title": "Mine"}, headers=headers)
    anon.post(
        "/api/files",
        files={"file": ("a.png", b"\x89PNG\r\n\x1a\nxx", "image/png")},
        headers=headers,
    )
    assert storage.objects

    wrong = anon.post("/api/auth/delete-account", json={"password": "wrong"}, headers=headers)
    assert wrong.status_code == 422
    response = anon.post("/api/auth/delete-account", json={"password": PASSWORD}, headers=headers)

    assert response.status_code == 204
    assert anon.get("/api/auth/me", headers=headers).status_code == 401
    assert storage.objects == {}
    with db_factory() as db:
        assert db.query(Note).count() == 0


def test_accounts_cannot_touch_each_others_data(anon: TestClient) -> None:
    alice = register(anon, "alice@example.com")
    bob = register(anon, "bob@example.com")
    note = anon.post("/api/notes", json={"title": "Secret"}, headers=alice).json()
    category = anon.get("/api/categories", headers=alice).json()[0]
    task = anon.post("/api/tasks", json={"title": "Alice task"}, headers=alice).json()

    assert anon.get("/api/notes", headers=bob).json() == []
    assert anon.get(f"/api/notes/{note['id']}", headers=bob).status_code == 404
    assert (
        anon.patch(f"/api/notes/{note['id']}", json={"title": "x"}, headers=bob).status_code == 404
    )
    assert anon.delete(f"/api/notes/{note['id']}", headers=bob).status_code == 404
    created = anon.post("/api/notes", json={"category_id": category["id"]}, headers=bob)
    assert created.status_code == 422
    assert created.json()["code"] == "category_not_found"
    assert (
        anon.patch(f"/api/tasks/{task['id']}", json={"is_done": True}, headers=bob).status_code
        == 404
    )
