"""Password vault: the server stores ciphertext only and enforces ownership."""

from fastapi.testclient import TestClient

from tests.conftest import PASSWORD, register

SETUP = {
    "iterations": 600_000,
    "salt": "c2FsdHNhbHRzYWx0c2FsdA==",
    "verifier": "dmVyaWZpZXJ2ZXJpZmllcnZlcmlmaWVy",
}
BLOB = "ZW5jcnlwdGVkLWl0ZW0tZGF0YS0xMjM0"


def test_setup_and_items(client: TestClient) -> None:
    assert client.get("/api/vault").json() == {
        "configured": False,
        "kdf": None,
        "iterations": None,
        "salt": None,
        "verifier": None,
        "item_count": 0,
    }
    assert client.get("/api/vault/items").json()["code"] == "vault_not_configured"

    created = client.post("/api/vault", json=SETUP)
    assert created.status_code == 201
    assert created.json()["salt"] == SETUP["salt"]
    assert client.post("/api/vault", json=SETUP).json()["code"] == "vault_exists"

    item = client.post("/api/vault/items", json={"data": BLOB}).json()
    assert item["data"] == BLOB
    updated = client.put(f"/api/vault/items/{item['id']}", json={"data": BLOB + "AA"})
    assert updated.json()["data"] == BLOB + "AA"
    assert client.get("/api/vault").json()["item_count"] == 1
    assert client.delete(f"/api/vault/items/{item['id']}").status_code == 204
    assert client.get("/api/vault/items").json() == []


def test_rejects_non_base64_and_weak_kdf(client: TestClient) -> None:
    assert client.post("/api/vault", json={**SETUP, "iterations": 1000}).status_code == 422
    client.post("/api/vault", json=SETUP)
    assert (
        client.post("/api/vault/items", json={"data": "<script>alert(1)</script>"}).status_code
        == 422
    )


def test_rekey_must_include_every_item(client: TestClient) -> None:
    client.post("/api/vault", json=SETUP)
    a = client.post("/api/vault/items", json={"data": BLOB}).json()
    b = client.post("/api/vault/items", json={"data": BLOB}).json()
    new = {**SETUP, "salt": "bmV3c2FsdG5ld3NhbHRuZXc=", "verifier": BLOB + "BB"}

    partial = client.put("/api/vault", json={**new, "items": [{"id": a["id"], "data": BLOB}]})
    assert partial.json()["code"] == "vault_rekey_incomplete"

    items = [
        {"id": a["id"], "data": "TkVXMQ" + "A" * 20},
        {"id": b["id"], "data": "TkVXMg" + "A" * 20},
    ]
    done = client.put("/api/vault", json={**new, "items": items})
    assert done.status_code == 200
    assert done.json()["salt"] == new["salt"]
    assert {i["data"] for i in client.get("/api/vault/items").json()} == {i["data"] for i in items}


def test_reset_needs_account_password(client: TestClient) -> None:
    client.post("/api/vault", json=SETUP)
    client.post("/api/vault/items", json={"data": BLOB})
    assert client.post("/api/vault/reset", json={"password": "wrong"}).status_code == 422
    assert client.post("/api/vault/reset", json={"password": PASSWORD}).status_code == 204
    assert client.get("/api/vault").json()["configured"] is False


def test_items_are_private(client: TestClient, anon: TestClient) -> None:
    client.post("/api/vault", json=SETUP)
    item = client.post("/api/vault/items", json={"data": BLOB}).json()
    other = TestClient(anon.app, headers=register(anon, "other@example.com"))
    other.post("/api/vault", json=SETUP)
    assert other.put(f"/api/vault/items/{item['id']}", json={"data": BLOB}).status_code == 404
    assert other.delete(f"/api/vault/items/{item['id']}").status_code == 404
    assert other.get("/api/vault/items").json() == []
