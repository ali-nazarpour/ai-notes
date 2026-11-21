"""Category routes (per workspace)."""

from fastapi import APIRouter, status

from app.api.deps import DbSession, WorkspaceCtx
from app.schemas.category import CategoryInput, CategoryRead
from app.services import categories as categories_service

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead], summary="List categories with counts")
def list_categories(ctx: WorkspaceCtx, db: DbSession) -> list[CategoryRead]:
    return categories_service.list_categories(db, ctx.ws_id)


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED, summary="Create")
def create_category(body: CategoryInput, ctx: WorkspaceCtx, db: DbSession) -> CategoryRead:
    category = categories_service.create_category(db, ctx, body)
    return categories_service.read_category(db, category)


@router.put("/{category_id}", response_model=CategoryRead, summary="Rename or recolor")
def update_category(
    category_id: int, body: CategoryInput, ctx: WorkspaceCtx, db: DbSession
) -> CategoryRead:
    ctx.require_edit()
    category = categories_service.get_category(db, ctx.ws_id, category_id)
    return categories_service.read_category(
        db, categories_service.update_category(db, category, body)
    )


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete (its notes and tasks are kept)",
)
def delete_category(category_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    ctx.require_edit()
    categories_service.delete_category(
        db, categories_service.get_category(db, ctx.ws_id, category_id)
    )
