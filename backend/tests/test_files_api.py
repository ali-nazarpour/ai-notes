"""Uploads: type detection, size limits, downloads with Range support."""

from fastapi.testclient import TestClient

from app.services.files import detect_media_type
from app.storage import MemoryStorage

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 100
MP4 = b"\x00\x00\x00\x18ftypisom" + bytes(range(200))


def upload(client: TestClient, data: bytes, name: str = "file.bin", content_type: str = "x/y"):  # type: ignore[no-untyped-def]
    return client.post("/api/files", files={"file": (name, data, content_type)})


def test_detects_media_types_from_bytes() -> None:
    assert detect_media_type(PNG).content_type == "image/png"  # type: ignore[union-attr]
    assert detect_media_type(b"\xff\xd8\xff\xe0").content_type == "image/jpeg"  # type: ignore[union-attr]
    assert detect_media_type(b"RIFF\x00\x00\x00\x00WEBPVP8").kind == "image"  # type: ignore[union-attr]
    assert detect_media_type(b"\x00\x00\x00\x1cftypavif").content_type == "image/avif"  # type: ignore[union-attr]
    assert detect_media_type(MP4).content_type == "video/mp4"  # type: ignore[union-attr]
    assert detect_media_type(b"\x1a\x45\xdf\xa3").content_type == "video/webm"  # type: ignore[union-attr]
    assert detect_media_type(b"<svg xmlns=...>") is None
    assert detect_media_type(b"<html>") is None


def test_upload_image_and_download(client: TestClient, storage: MemoryStorage) -> None:
    response = upload(client, PNG, "cat.png", "application/octet-stream")

    assert response.status_code == 201
    body = response.json()
    assert body["kind"] == "image"
    assert body["content_type"] == "image/png"  # from the bytes, not from the client
    assert body["size"] == len(PNG)
    assert body["url"] == f"/api/files/{body['id']}"
    assert len(storage.objects) == 1

    download = client.get(body["url"], headers={"Authorization": ""})
    assert download.status_code == 200
    assert download.content == PNG
    assert download.headers["content-type"] == "image/png"
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.headers["accept-ranges"] == "bytes"


def test_rejects_unsupported_types(client: TestClient) -> None:
    response = upload(client, b"<svg onload=alert(1)>", "x.svg", "image/svg+xml")
    assert response.status_code == 422
    assert response.json()["code"] == "unsupported_file_type"


def test_rejects_files_over_the_limit(client: TestClient) -> None:
    response = upload(client, b"\x89PNG\r\n\x1a\n" + b"x" * 2000, "big.png")
    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"
    assert upload(client, MP4, "clip.mp4").status_code == 201  # videos have a higher limit


def test_upload_requires_login(anon: TestClient) -> None:
    assert upload(anon, PNG).status_code == 401


def test_range_requests(client: TestClient) -> None:
    url = upload(client, MP4, "clip.mp4").json()["url"]

    partial = client.get(url, headers={"Range": "bytes=10-19"})
    assert partial.status_code == 206
    assert partial.content == MP4[10:20]
    assert partial.headers["content-range"] == f"bytes 10-19/{len(MP4)}"

    suffix = client.get(url, headers={"Range": "bytes=-5"})
    assert suffix.content == MP4[-5:]
    open_ended = client.get(url, headers={"Range": f"bytes={len(MP4) - 3}-"})
    assert open_ended.content == MP4[-3:]

    invalid = client.get(url, headers={"Range": f"bytes={len(MP4) + 10}-"})
    assert invalid.status_code == 416


def test_unknown_file_returns_404(client: TestClient) -> None:
    response = client.get("/api/files/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.json()["code"] == "file_not_found"
