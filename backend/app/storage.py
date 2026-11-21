"""
Object storage for uploaded files.

The app talks to an ``ObjectStorage``. In production that is MinIO (any S3-compatible
service works); tests use ``MemoryStorage`` through a dependency override.
"""

import logging
import threading
from collections.abc import Iterator
from functools import lru_cache
from typing import BinaryIO, Protocol

from minio import Minio
from minio.error import MinioException
from urllib3.exceptions import HTTPError as Urllib3Error

from app.core.config import get_settings
from app.core.errors import NotFoundError, ServiceUnavailableError

logger = logging.getLogger(__name__)

_CHUNK = 256 * 1024


class StorageUnavailableError(ServiceUnavailableError):
    default_code = "storage_unavailable"
    default_message = "File storage is not available right now."


class ObjectStorage(Protocol):
    def put(self, key: str, data: BinaryIO, length: int, content_type: str) -> None: ...

    def open(self, key: str, offset: int = 0, length: int | None = None) -> Iterator[bytes]: ...

    def delete_prefix(self, prefix: str) -> None: ...

    def delete_keys(self, keys: list[str]) -> None: ...


class MinioStorage:
    def __init__(self, endpoint: str, access_key: str, secret_key: str, bucket: str, secure: bool):
        self._client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        self._bucket = bucket
        self._bucket_ready = False
        self._lock = threading.Lock()

    def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        with self._lock:
            if not self._client.bucket_exists(self._bucket):
                self._client.make_bucket(self._bucket)
                logger.info("Created storage bucket %s", self._bucket)
            self._bucket_ready = True

    def ensure_ready(self) -> None:
        try:
            self._ensure_bucket()
        except (MinioException, Urllib3Error, OSError) as exc:
            raise StorageUnavailableError() from exc

    def put(self, key: str, data: BinaryIO, length: int, content_type: str) -> None:
        self.ensure_ready()
        try:
            self._client.put_object(self._bucket, key, data, length, content_type=content_type)
        except (MinioException, Urllib3Error, OSError) as exc:
            logger.error("Storage upload failed (%s)", type(exc).__name__)
            raise StorageUnavailableError() from exc

    def open(self, key: str, offset: int = 0, length: int | None = None) -> Iterator[bytes]:
        try:
            response = self._client.get_object(self._bucket, key, offset=offset, length=length or 0)
        except MinioException as exc:
            if getattr(exc, "code", "") == "NoSuchKey":
                raise NotFoundError(code="file_not_found") from exc
            raise StorageUnavailableError() from exc
        except (Urllib3Error, OSError) as exc:
            raise StorageUnavailableError() from exc

        def stream() -> Iterator[bytes]:
            try:
                yield from response.stream(_CHUNK)
            finally:
                response.close()
                response.release_conn()

        return stream()

    def delete_prefix(self, prefix: str) -> None:
        try:
            for item in self._client.list_objects(self._bucket, prefix=prefix, recursive=True):
                self._client.remove_object(self._bucket, item.object_name)
        except (MinioException, Urllib3Error, OSError) as exc:
            logger.warning("Could not delete stored files under %s (%s)", prefix, exc)

    def delete_keys(self, keys: list[str]) -> None:
        for key in keys:
            try:
                self._client.remove_object(self._bucket, key)
            except (MinioException, Urllib3Error, OSError) as exc:
                logger.warning("Could not delete stored file %s (%s)", key, exc)


class MemoryStorage:
    """In-memory storage for tests."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, data: BinaryIO, length: int, content_type: str) -> None:
        self.objects[key] = (data.read(length), content_type)

    def open(self, key: str, offset: int = 0, length: int | None = None) -> Iterator[bytes]:
        if key not in self.objects:
            raise NotFoundError(code="file_not_found")
        content = self.objects[key][0]
        end = len(content) if length is None else offset + length
        return iter([content[offset:end]])

    def delete_prefix(self, prefix: str) -> None:
        for key in [k for k in self.objects if k.startswith(prefix)]:
            del self.objects[key]

    def delete_keys(self, keys: list[str]) -> None:
        for key in keys:
            self.objects.pop(key, None)


@lru_cache
def get_storage() -> ObjectStorage:
    settings = get_settings()
    return MinioStorage(
        settings.minio_endpoint,
        settings.minio_access_key,
        settings.minio_secret_key,
        settings.minio_bucket,
        settings.minio_secure,
    )
