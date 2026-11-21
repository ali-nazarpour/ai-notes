"""
Outgoing email (SMTP) and the app-wide settings stored in ``app_settings``.

The SMTP password is encrypted with AES-256-GCM before it is stored; the key is derived
from ``APP_SECRET_KEY``. The API never returns it. Gmail works with
``smtp.gmail.com:587`` (STARTTLS) and an *App password* (Google account -> Security ->
2-Step Verification -> App passwords).

Every message is recorded in ``email_log`` (sent / failed / skipped) for the admin panel.
"""

import base64
import hashlib
import html
import logging
import secrets
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Any, Literal

from Crypto.Cipher import AES
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import AppSetting, EmailLog

logger = logging.getLogger(__name__)

Security = Literal["starttls", "ssl", "none"]


# ---------------------------------------------------------------- stored settings


def get_setting(db: Session, key: str) -> dict[str, Any]:
    row = db.get(AppSetting, key)
    return dict(row.value or {}) if row is not None else {}


def put_setting(db: Session, key: str, value: dict[str, Any]) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
    db.commit()


@dataclass
class GeneralSettings:
    app_name: str = "AI Notes"
    app_url: str = ""
    allow_registration: bool = True


def general(db: Session, settings: Settings) -> GeneralSettings:
    stored = get_setting(db, "general")
    return GeneralSettings(
        app_name=str(stored.get("app_name") or "AI Notes"),
        app_url=str(stored.get("app_url") or settings.app_url).rstrip("/"),
        allow_registration=bool(stored.get("allow_registration", True)),
    )


# ---------------------------------------------------------------- secret encryption


def _key(settings: Settings) -> bytes:
    secret = settings.app_secret_key or f"ai-notes:{settings.database_url}"
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_secret(settings: Settings, plain: str) -> str:
    nonce = secrets.token_bytes(12)
    cipher = AES.new(_key(settings), AES.MODE_GCM, nonce=nonce)
    data, tag = cipher.encrypt_and_digest(plain.encode("utf-8"))
    return base64.b64encode(nonce + tag + data).decode("ascii")


def decrypt_secret(settings: Settings, stored: str) -> str | None:
    try:
        raw = base64.b64decode(stored)
        cipher = AES.new(_key(settings), AES.MODE_GCM, nonce=raw[:12])
        return cipher.decrypt_and_verify(raw[28:], raw[12:28]).decode("utf-8")
    except (ValueError, KeyError):
        return None


@dataclass
class SmtpConfig:
    enabled: bool = False
    host: str = ""
    port: int = 587
    security: Security = "starttls"
    username: str = ""
    password: str = ""
    from_email: str = ""
    from_name: str = ""

    @property
    def ready(self) -> bool:
        return self.enabled and bool(self.host and self.from_email)


def smtp_config(db: Session, settings: Settings) -> SmtpConfig:
    stored = get_setting(db, "smtp")
    password = ""
    if stored.get("password"):
        password = decrypt_secret(settings, str(stored["password"])) or ""
    security = stored.get("security")
    return SmtpConfig(
        enabled=bool(stored.get("enabled", False)),
        host=str(stored.get("host", "")),
        port=int(stored.get("port", 587)),
        security=security if security in ("starttls", "ssl", "none") else "starttls",
        username=str(stored.get("username", "")),
        password=password,
        from_email=str(stored.get("from_email", "")),
        from_name=str(stored.get("from_name", "")),
    )


def save_smtp(db: Session, settings: Settings, values: dict[str, Any]) -> None:
    """Saves SMTP settings. ``password`` None keeps the stored one, "" clears it."""
    stored = get_setting(db, "smtp")
    password = values.pop("password", None)
    stored.update(values)
    if password is not None:
        stored["password"] = encrypt_secret(settings, password) if password else ""
    put_setting(db, "smtp", stored)


# ---------------------------------------------------------------- messages


@dataclass
class Mail:
    to: str
    subject: str
    kind: str
    heading: str
    paragraphs: list[str]
    button: tuple[str, str] | None = None  # (label, url)
    footer: str = ""
    rtl: bool = False
    extra_lines: list[str] = field(default_factory=list)

    def text(self) -> str:
        lines = [self.heading, "", *self.paragraphs]
        if self.button:
            lines += ["", f"{self.button[0]}: {self.button[1]}"]
        lines += self.extra_lines
        if self.footer:
            lines += ["", self.footer]
        return "\n".join(lines)

    def html(self, app_name: str) -> str:
        direction = "rtl" if self.rtl else "ltr"
        align = "right" if self.rtl else "left"
        paragraphs = "".join(
            f'<p style="margin:0 0 14px;line-height:1.7">{html.escape(p)}</p>'
            for p in self.paragraphs
        )
        button = ""
        if self.button:
            label, url = self.button
            button = (
                f'<p style="margin:24px 0"><a href="{html.escape(url, quote=True)}" '
                'style="background:#e8743b;color:#fff;text-decoration:none;padding:12px 22px;'
                f'border-radius:10px;font-weight:600;display:inline-block">{html.escape(label)}</a>'
                f'</p><p style="font-size:12px;color:#888;word-break:break-all">'
                f"{html.escape(url)}</p>"
            )
        footer = (
            f'<p style="font-size:12px;color:#999;margin-top:24px">{html.escape(self.footer)}</p>'
            if self.footer
            else ""
        )
        return (
            f'<!doctype html><html dir="{direction}"><body style="margin:0;background:#f4f4f5;'
            'font-family:Vazirmatn,Tahoma,Segoe UI,Arial,sans-serif;color:#18181b">'
            '<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;'
            f'padding:32px;text-align:{align}">'
            f'<div style="font-weight:700;color:#e8743b;margin-bottom:18px">'
            f"{html.escape(app_name)}</div>"
            f'<h1 style="font-size:20px;margin:0 0 16px">{html.escape(self.heading)}</h1>'
            f"{paragraphs}{button}{footer}</div></body></html>"
        )


def _build(config: SmtpConfig, mail: Mail, app_name: str) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = mail.subject
    message["From"] = formataddr((config.from_name or app_name, config.from_email))
    message["To"] = mail.to
    message["Message-ID"] = make_msgid(domain=config.from_email.rsplit("@", 1)[-1] or None)
    message.set_content(mail.text())
    message.add_alternative(mail.html(app_name), subtype="html")
    return message


def deliver(config: SmtpConfig, message: EmailMessage, timeout: float = 20.0) -> None:
    """Sends one message. Raises smtplib/OSError on failure."""
    context = ssl.create_default_context()
    smtp: smtplib.SMTP
    if config.security == "ssl":
        smtp = smtplib.SMTP_SSL(config.host, config.port, timeout=timeout, context=context)
    else:
        smtp = smtplib.SMTP(config.host, config.port, timeout=timeout)
    with smtp:
        if config.security == "starttls":
            smtp.starttls(context=context)
        if config.username:
            smtp.login(config.username, config.password)
        smtp.send_message(message)


def _describe(exc: Exception) -> str:
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "Authentication failed: check the username and the app password."
    return f"{type(exc).__name__}: {exc}"[:500]


def send(db: Session, settings: Settings, mail: Mail) -> str:
    """Sends now and logs the result. Returns "sent", "failed" or "skipped" (not set up)."""
    config = smtp_config(db, settings)
    status, error = "skipped", ""
    if config.ready:
        try:
            deliver(config, _build(config, mail, general(db, settings).app_name))
            status = "sent"
        except (smtplib.SMTPException, OSError, ValueError) as exc:
            status, error = "failed", _describe(exc)
            logger.warning("Email %s to %s failed: %s", mail.kind, mail.to, error)
    db.add(
        EmailLog(
            to_email=mail.to, subject=mail.subject[:200], kind=mail.kind, status=status, error=error
        )
    )
    db.commit()
    return status


def send_test(db: Session, settings: Settings, to: str, rtl: bool) -> tuple[str, str]:
    """Sends a test message and returns (status, error) without hiding the error."""
    config = smtp_config(db, settings)
    if not config.ready:
        return "skipped", "The email service is turned off or incomplete."
    mail = Mail(
        to=to,
        subject="ایمیل آزمایشی" if rtl else "Test email",
        kind="test",
        heading="سرویس ایمیل کار می‌کند ✅" if rtl else "Email is working ✅",
        paragraphs=[
            "این یک پیام آزمایشی از پنل مدیریت است."
            if rtl
            else "This is a test message sent from the admin panel."
        ],
        rtl=rtl,
    )
    try:
        deliver(config, _build(config, mail, general(db, settings).app_name))
        status, error = "sent", ""
    except (smtplib.SMTPException, OSError, ValueError) as exc:
        status, error = "failed", _describe(exc)
    db.add(EmailLog(to_email=to, subject=mail.subject, kind="test", status=status, error=error))
    db.commit()
    return status, error
