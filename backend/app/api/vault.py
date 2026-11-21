"""Password vault routes (end-to-end encrypted; see app/models/vault.py)."""

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.vault import (
    VaultItemRead,
    VaultItemWrite,
    VaultRekey,
    VaultReset,
    VaultSetup,
    VaultStatus,
)
from app.services import vault as vault_service

router = APIRouter(prefix="/api/vault", tags=["vault"])


@router.get("", response_model=VaultStatus, summary="Vault key material (no secrets)")
def get_status(user: CurrentUser, db: DbSession) -> VaultStatus:
    return vault_service.status(db, user.id)


@router.post("", response_model=VaultStatus, status_code=status.HTTP_201_CREATED, summary="Set up")
def setup(body: VaultSetup, user: CurrentUser, db: DbSession) -> VaultStatus:
    return vault_service.setup(db, user.id, body)


@router.put("", response_model=VaultStatus, summary="Change the master password")
def rekey(body: VaultRekey, user: CurrentUser, db: DbSession) -> VaultStatus:
    return vault_service.rekey(db, user.id, body)


@router.post(
    "/reset", status_code=status.HTTP_204_NO_CONTENT, summary="Delete the vault and its items"
)
def reset(body: VaultReset, user: CurrentUser, db: DbSession) -> None:
    vault_service.reset(db, user, body.password)


@router.get("/items", response_model=list[VaultItemRead], summary="Encrypted items")
def list_items(user: CurrentUser, db: DbSession) -> list[VaultItemRead]:
    return [VaultItemRead.model_validate(i) for i in vault_service.list_items(db, user.id)]


@router.post("/items", response_model=VaultItemRead, status_code=status.HTTP_201_CREATED)
def create_item(body: VaultItemWrite, user: CurrentUser, db: DbSession) -> VaultItemRead:
    return VaultItemRead.model_validate(vault_service.create_item(db, user.id, body.data))


@router.put("/items/{item_id}", response_model=VaultItemRead)
def update_item(
    item_id: int, body: VaultItemWrite, user: CurrentUser, db: DbSession
) -> VaultItemRead:
    return VaultItemRead.model_validate(vault_service.update_item(db, user.id, item_id, body.data))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, user: CurrentUser, db: DbSession) -> None:
    vault_service.delete_item(db, user.id, item_id)
