"""
Link previews for bookmark blocks: title, description, image and site name of a web page.

The server fetches the page, so it must not be usable to reach private services (SSRF):
only http/https on the default ports, every address the host name resolves to must be
public, redirects are followed by hand (max 3) and checked again, and at most
``link_preview_max_bytes`` of HTML is read.
"""

import html
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from app.core.config import Settings
from app.core.errors import InvalidInputError

_META = re.compile(r"<meta\s+[^>]*>", re.IGNORECASE)
_ATTR = re.compile(r"""([a-zA-Z:_-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)""")
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_ICON = re.compile(r"<link\s+[^>]*rel=[\"'][^\"']*icon[^\"']*[\"'][^>]*>", re.IGNORECASE)


@dataclass
class Preview:
    url: str
    title: str
    description: str
    image: str | None
    site_name: str
    favicon: str | None


def _blocked() -> InvalidInputError:
    return InvalidInputError("This address cannot be previewed.", code="link_preview_blocked")


def _check_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise _blocked()
    if parts.port not in (None, 80, 443):
        raise _blocked()
    try:
        infos = socket.getaddrinfo(parts.hostname, None)
    except (socket.gaierror, UnicodeError) as exc:
        raise InvalidInputError(
            "The address could not be found.", code="link_preview_failed"
        ) from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global or address.is_multicast:
            raise _blocked()


def _attrs(tag: str) -> dict[str, str]:
    return {k.lower(): html.unescape(v.strip("\"'")) for k, v in _ATTR.findall(tag)}


def parse(page: str, url: str) -> Preview:
    meta: dict[str, str] = {}
    for tag in _META.findall(page):
        attrs = _attrs(tag)
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        if key and "content" in attrs and key not in meta:
            meta[key] = attrs["content"].strip()
    title_match = _TITLE.search(page)
    title = (
        meta.get("og:title")
        or meta.get("twitter:title")
        or (html.unescape(title_match.group(1)).strip() if title_match else "")
    )
    image = meta.get("og:image") or meta.get("twitter:image")
    icon = None
    icon_tag = _ICON.search(page)
    if icon_tag:
        icon = _attrs(icon_tag.group(0)).get("href")
    host = urlsplit(url).hostname or ""
    return Preview(
        url=url,
        title=re.sub(r"\s+", " ", title)[:300],
        description=re.sub(
            r"\s+", " ", meta.get("og:description") or meta.get("description") or ""
        )[:500],
        image=urljoin(url, image) if image else None,
        site_name=(meta.get("og:site_name") or host.removeprefix("www."))[:100],
        favicon=urljoin(url, icon) if icon else urljoin(url, "/favicon.ico"),
    )


def fetch(settings: Settings, url: str) -> Preview:
    current = url
    with httpx.Client(
        timeout=settings.link_preview_timeout_seconds,
        follow_redirects=False,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; NotesLinkPreview/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    ) as client:
        for _ in range(4):
            _check_url(current)
            try:
                with client.stream("GET", current) as response:
                    if response.is_redirect and "location" in response.headers:
                        current = urljoin(current, response.headers["location"])
                        continue
                    if response.status_code >= 400:
                        raise InvalidInputError(
                            "The page could not be loaded.", code="link_preview_failed"
                        )
                    if "html" not in response.headers.get("content-type", ""):
                        host = urlsplit(current).hostname or ""
                        name = current.rsplit("/", 1)[-1] or host
                        return Preview(current, name, "", None, host, None)
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        chunks.append(chunk)
                        size += len(chunk)
                        if size >= settings.link_preview_max_bytes:
                            break
                    text = b"".join(chunks).decode(response.encoding or "utf-8", "replace")
                    return parse(text, current)
            except httpx.HTTPError as exc:
                raise InvalidInputError(
                    "The page could not be loaded.", code="link_preview_failed"
                ) from exc
    raise InvalidInputError("Too many redirects.", code="link_preview_failed")
