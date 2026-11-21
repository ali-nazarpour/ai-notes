"""Password vault schemas. Every secret arrives already encrypted by the browser."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# base64 of (12-byte IV + AES-GCM ciphertext). 64 KB is far more than one login needs.
Ciphertext = Field(min_length=16, max_length=65_536, pattern=r"^[A-Za-z0-9+/=]+$")


class VaultSetup(BaseModel):
    kdf: str = Field(default="pbkdf2-sha256", pattern=r"^pbkdf2-sha256$")
    iterations: int = Field(ge=100_000, le=5_000_000)
    salt: str = Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9+/=]+$")
    verifier: str = Ciphertext


class VaultStatus(BaseModel):
    configured: bool
    kdf: str | None = None
    iterations: int | None = None
    salt: str | None = None
    verifier: str | None = None
    item_count: int = 0


class VaultItemWrite(BaseModel):
    data: str = Ciphertext


class VaultItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    data: str
    created_at: datetime
    updated_at: datetime


class ReencryptedItem(BaseModel):
    id: int
    data: str = Ciphertext


class VaultRekey(VaultSetup):
    """Change of master password: new KDF settings plus every item re-encrypted."""

    items: list[ReencryptedItem] = Field(max_length=10_000)


class VaultReset(BaseModel):
    password: str = Field(min_length=1, max_length=128, description="The account password.")
