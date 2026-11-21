"""Password vault storage. The server only stores and returns ciphertexts."""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, InvalidInputError, NotFoundError
from app.core.security import verify_password
from app.models import User, Vault, VaultItem
from app.schemas.vault import VaultRekey, VaultSetup, VaultStatus


def status(db: Session, user_id: int) -> VaultStatus:
    vault = db.get(Vault, user_id)
    if vault is None:
        return VaultStatus(configured=False)
    count = db.scalar(select(func.count()).where(VaultItem.user_id == user_id)) or 0
    return VaultStatus(
        configured=True,
        kdf=vault.kdf,
        iterations=vault.iterations,
        salt=vault.salt,
        verifier=vault.verifier,
        item_count=count,
    )


def _require_vault(db: Session, user_id: int) -> Vault:
    vault = db.get(Vault, user_id)
    if vault is None:
        raise ConflictError("Set up the vault first.", code="vault_not_configured")
    return vault


def setup(db: Session, user_id: int, body: VaultSetup) -> VaultStatus:
    if db.get(Vault, user_id) is not None:
        raise ConflictError("The vault is already set up.", code="vault_exists")
    db.add(
        Vault(
            user_id=user_id,
            kdf=body.kdf,
            iterations=body.iterations,
            salt=body.salt,
            verifier=body.verifier,
        )
    )
    db.commit()
    return status(db, user_id)


def list_items(db: Session, user_id: int) -> list[VaultItem]:
    _require_vault(db, user_id)
    return list(
        db.scalars(select(VaultItem).where(VaultItem.user_id == user_id).order_by(VaultItem.id))
    )


def _get_item(db: Session, user_id: int, item_id: int) -> VaultItem:
    item = db.get(VaultItem, item_id)
    if item is None or item.user_id != user_id:
        raise NotFoundError("Item not found.", code="vault_item_not_found")
    return item


def create_item(db: Session, user_id: int, data: str) -> VaultItem:
    _require_vault(db, user_id)
    item = VaultItem(user_id=user_id, data=data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, user_id: int, item_id: int, data: str) -> VaultItem:
    item = _get_item(db, user_id, item_id)
    item.data = data
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, user_id: int, item_id: int) -> None:
    db.delete(_get_item(db, user_id, item_id))
    db.commit()


def rekey(db: Session, user_id: int, body: VaultRekey) -> VaultStatus:
    """Replaces the key material and every item in one transaction (all or nothing)."""
    vault = _require_vault(db, user_id)
    items = {item.id: item for item in list_items(db, user_id)}
    sent = {item.id for item in body.items}
    if sent != set(items):
        raise InvalidInputError(
            "Every item must be re-encrypted with the new key.", code="vault_rekey_incomplete"
        )
    for new in body.items:
        items[new.id].data = new.data
    vault.kdf = body.kdf
    vault.iterations = body.iterations
    vault.salt = body.salt
    vault.verifier = body.verifier
    db.commit()
    return status(db, user_id)


def reset(db: Session, user: User, password: str) -> None:
    """Deletes the vault and all items (for a forgotten master password)."""
    if not verify_password(password, user.password_hash):
        raise InvalidInputError("The password is wrong.", code="wrong_password")
    db.execute(delete(VaultItem).where(VaultItem.user_id == user.id))
    db.execute(delete(Vault).where(Vault.user_id == user.id))
    db.commit()
