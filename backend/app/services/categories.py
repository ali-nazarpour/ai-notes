"""Categories belong to a workspace; another workspace's category looks missing."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, InvalidInputError, NotFoundError
from app.models import Category, Note, Task
from app.schemas.category import CategoryInput, CategoryRead
from app.services.access import Ctx


def _name_taken() -> ConflictError:
    return ConflictError("You already have a category with this name.", code="category_name_taken")


def find_category(db: Session, ws_id: int, category_id: int) -> Category | None:
    category = db.get(Category, category_id)
    return category if category is not None and category.workspace_id == ws_id else None


def get_category(db: Session, ws_id: int, category_id: int) -> Category:
    category = find_category(db, ws_id, category_id)
    if category is None:
        raise NotFoundError("Category not found.", code="category_not_found")
    return category


def ensure_owned(db: Session, ws_id: int | None, category_id: int | None) -> None:
    """Validates a category id from a request body (422 if it is not in the workspace)."""
    if category_id is not None and (ws_id is None or find_category(db, ws_id, category_id) is None):
        raise InvalidInputError("Category not found.", code="category_not_found")


def _is_name_taken(db: Session, ws_id: int, name: str, exclude_id: int | None = None) -> bool:
    query = select(Category.id).where(
        Category.workspace_id == ws_id, func.lower(Category.name) == name.lower()
    )
    if exclude_id is not None:
        query = query.where(Category.id != exclude_id)
    return db.scalar(query) is not None


def _counts(db: Session, ws_id: int) -> tuple[dict[int, int], dict[int, int]]:
    notes = db.execute(
        select(Note.category_id, func.count())
        .where(
            Note.workspace_id == ws_id,
            Note.category_id.is_not(None),
            Note.deleted_at.is_(None),
        )
        .group_by(Note.category_id)
    ).all()
    tasks = db.execute(
        select(Task.category_id, func.count())
        .where(Task.workspace_id == ws_id, Task.category_id.is_not(None), Task.is_done.is_(False))
        .group_by(Task.category_id)
    ).all()
    return (
        {row[0]: row[1] for row in notes if row[0] is not None},
        {row[0]: row[1] for row in tasks if row[0] is not None},
    )


def _to_read(category: Category, notes: dict[int, int], tasks: dict[int, int]) -> CategoryRead:
    read = CategoryRead.model_validate(category)
    read.note_count = notes.get(category.id, 0)
    read.open_task_count = tasks.get(category.id, 0)
    return read


def list_categories(db: Session, ws_id: int) -> list[CategoryRead]:
    categories = db.scalars(
        select(Category)
        .where(Category.workspace_id == ws_id)
        .order_by(Category.created_at, Category.id)
    ).all()
    notes, tasks = _counts(db, ws_id)
    return [_to_read(category, notes, tasks) for category in categories]


def read_category(db: Session, category: Category) -> CategoryRead:
    notes, tasks = _counts(db, category.workspace_id)
    return _to_read(category, notes, tasks)


def create_category(db: Session, ctx: Ctx, data: CategoryInput) -> Category:
    ctx.require_edit()
    if _is_name_taken(db, ctx.ws_id, data.name):
        raise _name_taken()
    category = Category(
        user_id=ctx.user_id,
        workspace_id=ctx.ws_id,
        name=data.name,
        color=data.color,
        icon=data.icon,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(db: Session, category: Category, data: CategoryInput) -> Category:
    if _is_name_taken(db, category.workspace_id, data.name, exclude_id=category.id):
        raise _name_taken()
    category.name = data.name
    category.color = data.color
    category.icon = data.icon
    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category: Category) -> None:
    db.delete(category)  # notes and tasks keep existing (ON DELETE SET NULL)
    db.commit()
