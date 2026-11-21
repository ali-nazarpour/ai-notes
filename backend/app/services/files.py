"""
Uploads and downloads: images, videos, audio and documents.

The file type is detected from the first bytes ("magic numbers"), never trusted from the
client. SVG and HTML are not accepted, because a browser could run scripts inside them.
Documents (PDF, Office, ZIP, plain text) are always downloaded, never shown inline.
Downloads support HTTP Range requests, which browsers need to seek in videos.
"""

import re
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import BinaryIO
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import (
    InvalidInputError,
    NotFoundError,
    PayloadTooLargeError,
    RangeNotSatisfiableError,
)
from app.models import StoredFile
from app.storage import ObjectStorage


@dataclass(frozen=True)
class MediaType:
    kind: str  # "image" | "video" | "audio" | "file"
    content_type: str
    extension: str


_OFFICE = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_TEXT = {"txt": "text/plain", "md": "text/markdown", "csv": "text/csv", "json": "application/json"}


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def detect_file_type(head: bytes, filename: str) -> MediaType | None:
    """Media first, then audio and documents. ``head`` should be at least 4 KB."""
    media = detect_media_type(head)
    if media is not None:
        return media
    ext = _extension(filename)
    if head.startswith(b"ID3") or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return MediaType("audio", "audio/mpeg", "mp3")
    if head.startswith(b"OggS"):
        return MediaType("audio", "audio/ogg", "ogg")
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return MediaType("audio", "audio/wav", "wav")
    if head.startswith(b"fLaC"):
        return MediaType("audio", "audio/flac", "flac")
    if head.startswith(b"%PDF-"):
        return MediaType("file", "application/pdf", "pdf")
    if head.startswith(b"PK\x03\x04"):
        if ext in _OFFICE:
            return MediaType("file", _OFFICE[ext], ext)
        return MediaType("file", "application/zip", "zip")
    if ext in _TEXT and b"\x00" not in head:
        try:
            head.decode("utf-8")
        except UnicodeDecodeError as exc:
            if exc.start < len(head) - 4:  # a multi-byte character cut at the end is fine
                return None
        return MediaType("file", _TEXT[ext], ext)
    return None


def detect_media_type(head: bytes) -> MediaType | None:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return MediaType("image", "image/png", "png")
    if head.startswith(b"\xff\xd8\xff"):
        return MediaType("image", "image/jpeg", "jpg")
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return MediaType("image", "image/gif", "gif")
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return MediaType("image", "image/webp", "webp")
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return MediaType("video", "video/webm", "webm")
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"avif", b"avis"):
            return MediaType("image", "image/avif", "avif")
        if brand in (b"M4A ", b"M4B "):
            return MediaType("audio", "audio/mp4", "m4a")
        if brand == b"qt  ":
            return MediaType("video", "video/quicktime", "mov")
        return MediaType("video", "video/mp4", "mp4")
    return None


def store_upload(
    db: Session,
    storage: ObjectStorage,
    settings: Settings,
    user_id: int,
    data: BinaryIO,
    filename: str,
) -> StoredFile:
    head = data.read(4096)
    media = detect_file_type(head, filename)
    if media is None:
        raise InvalidInputError(
            "Supported: images (PNG, JPEG, GIF, WebP, AVIF), videos (MP4, WebM, MOV), audio "
            "(MP3, M4A, OGG, WAV, FLAC) and documents (PDF, DOCX, XLSX, PPTX, ZIP, TXT, MD, "
            "CSV, JSON).",
            code="unsupported_file_type",
        )
    data.seek(0, 2)
    size = data.tell()
    data.seek(0)
    limit = {
        "image": settings.upload_max_image_bytes,
        "video": settings.upload_max_video_bytes,
        "audio": settings.upload_max_audio_bytes,
    }.get(media.kind, settings.upload_max_file_bytes)
    if size > limit:
        raise PayloadTooLargeError(
            f"The file is too large (limit {limit // (1024 * 1024)} MB).",
            code="file_too_large",
            limit_mb=limit // (1024 * 1024),
        )

    file_id = uuid.uuid4()
    key = f"{user_id}/{file_id}.{media.extension}"
    storage.put(key, data, size, media.content_type)
    row = StoredFile(
        id=file_id,
        user_id=user_id,
        kind=media.kind,
        content_type=media.content_type,
        size=size,
        original_name=filename[:255],
        object_key=key,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


_SAFE_EXT = re.compile(r"^[a-z0-9]{1,10}$")


def store_any(
    db: Session,
    storage: ObjectStorage,
    user_id: int,
    data: BinaryIO,
    filename: str,
    size: int,
) -> StoredFile:
    """
    Stores a file of any type (for the drive). Known media keep their real type; anything
    else is stored as ``application/octet-stream`` and is always downloaded, never shown
    in the browser, so HTML or SVG files cannot run scripts in the app.
    """
    head = data.read(4096)
    data.seek(0)
    ext = _extension(filename)
    media = detect_file_type(head, filename) or MediaType(
        "file", "application/octet-stream", ext if _SAFE_EXT.match(ext) else "bin"
    )
    file_id = uuid.uuid4()
    key = f"{user_id}/{file_id}.{media.extension}"
    storage.put(key, data, size, media.content_type)
    row = StoredFile(
        id=file_id,
        user_id=user_id,
        kind=media.kind,
        content_type=media.content_type,
        size=size,
        original_name=filename[:255],
        object_key=key,
    )
    db.add(row)
    db.flush()
    return row


def get_file(db: Session, file_id: uuid.UUID) -> StoredFile:
    row = db.get(StoredFile, file_id)
    if row is None:
        raise NotFoundError("File not found.", code="file_not_found")
    return row


_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _disposition(row: StoredFile) -> str:
    if row.kind != "file":
        return "inline"
    name = row.original_name or f"file.{_extension(row.object_key)}"
    ascii_name = name.encode("ascii", "ignore").decode().replace('"', "") or "download"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"


@dataclass
class Download:
    status: int
    headers: dict[str, str]
    body: Iterator[bytes]


def open_download(storage: ObjectStorage, row: StoredFile, range_header: str | None) -> Download:
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": _disposition(row),
    }
    size = row.size
    if not range_header:
        headers["Content-Length"] = str(size)
        return Download(200, headers, storage.open(row.object_key))

    match = _RANGE.match(range_header.strip())
    if match is None or (not match.group(1) and not match.group(2)):
        raise RangeNotSatisfiableError()
    if match.group(1):
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else size - 1
    else:  # "bytes=-N": the last N bytes
        start = max(size - int(match.group(2)), 0)
        end = size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        raise RangeNotSatisfiableError()

    length = end - start + 1
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(length)
    return Download(206, headers, storage.open(row.object_key, offset=start, length=length))
