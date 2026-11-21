"""
Shared fixtures.

- In-memory SQLite (foreign keys on), recreated for every test; never touches real data.
- MemoryStorage instead of MinIO.
- A fake Ollama via httpx.MockTransport, so the real client code runs without a model.
- `client` is signed in as owner@example.com; `anon` has no token.
"""

import os
from collections.abc import Callable, Generator

os.environ["DATABASE_URL"] = "sqlite://"

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.client import OllamaClient
from app.api.deps import get_ollama_client
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.storage import MemoryStorage, get_storage

TEST_MODEL = "test-model:1b"
PASSWORD = "correct horse 1"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="sqlite://",
        ollama_base_url="http://ollama.test",
        ollama_model=TEST_MODEL,
        ai_context_char_budget=2000,
        ai_max_question_chars=200,
        ai_max_edit_chars=500,
        ai_summary_max_chunks=4,
        upload_max_image_bytes=1024,
        upload_max_video_bytes=4096,
    )


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


@pytest.fixture
def db_factory(
    settings: Settings, storage: MemoryStorage
) -> Generator[sessionmaker[Session], None, None]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record):  # type: ignore[no-untyped-def]
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_storage] = lambda: storage
    yield session_factory
    app.dependency_overrides.clear()
    engine.dispose()


def register(
    client: TestClient, email: str = "owner@example.com", language: str = "en"
) -> dict[str, str]:
    response = client.post(
        "/api/auth/register", json={"email": email, "password": PASSWORD, "language": language}
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def anon(db_factory: sessionmaker[Session]) -> TestClient:
    return TestClient(app)


@pytest.fixture
def client(anon: TestClient) -> TestClient:
    return TestClient(app, headers=register(anon))


OllamaHandler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture
def mock_ollama(settings: Settings) -> Callable[[OllamaHandler], None]:
    """mock_ollama(handler): every request to Ollama goes to `handler` instead."""

    def install(handler: OllamaHandler) -> None:
        transport = httpx.MockTransport(handler)
        app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
            settings, transport=transport
        )

    return install


def chat_response(content: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"model": TEST_MODEL, "message": {"role": "assistant", "content": content}},
    )


def create_note(client: TestClient, title: str = "Trip", content: str = "", **fields) -> dict:  # type: ignore[no-untyped-def]
    response = client.post("/api/notes", json={"title": title, "content": content, **fields})
    assert response.status_code == 201, response.text
    return response.json()
