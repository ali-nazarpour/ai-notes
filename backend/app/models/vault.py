"""
Password vault (end-to-end encrypted).

The browser derives a key from the user's master password (PBKDF2-SHA256) and encrypts every
item with AES-GCM before sending it. The server stores only the salt, the KDF settings, an
encrypted "verifier" (to check the master password locally) and opaque ciphertexts. It can
never read a stored password, and the master password never leaves the browser.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Vault(Base):
    __tablename__ = "vaults"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    kdf: Mapped[str] = mapped_column(String(20), nullable=False, default="pbkdf2-sha256")
    iterations: Mapped[int] = mapped_column(Integer, nullable=False)
    salt: Mapped[str] = mapped_column(String(64), nullable=False)  # base64
    verifier: Mapped[str] = mapped_column(Text, nullable=False)  # base64 iv + ciphertext
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class VaultItem(Base):
    __tablename__ = "vault_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    data: Mapped[str] = mapped_column(Text, nullable=False)  # base64 iv + ciphertext
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
