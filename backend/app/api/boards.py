"""Kanban board routes: boards, lists, cards, comments."""

from fastapi import APIRouter, status

from app.api.deps import DbSession, WorkspaceCtx
from app.schemas.board import (
    BoardCreate,
    BoardRead,
    BoardSummary,
    BoardUpdate,
    CardCopy,
    CardCreate,
    CardRead,
    CardSummary,
    CardUpdate,
    CommentCreate,
    CommentRead,
    ListCreate,
    ListRead,
    ListSort,
    ListUpdate,
)
from app.services import boards as service

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.get("", response_model=list[BoardSummary], summary="All boards, recent first")
def list_boards(ctx: WorkspaceCtx, db: DbSession) -> list[BoardSummary]:
    return service.list_boards(db, ctx.ws_id)


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
def create_board(body: BoardCreate, ctx: WorkspaceCtx, db: DbSession) -> BoardRead:
    board = service.create_board(db, ctx, body, ctx.user.language)
    return service.board_read(db, board)


@router.get("/{board_id}", response_model=BoardRead, summary="Board with lists and cards")
def get_board(board_id: int, ctx: WorkspaceCtx, db: DbSession) -> BoardRead:
    return service.board_read(db, service.get_board(db, ctx, board_id))


@router.patch("/{board_id}", response_model=BoardRead)
def update_board(board_id: int, body: BoardUpdate, ctx: WorkspaceCtx, db: DbSession) -> BoardRead:
    board = service.get_board(db, ctx, board_id, write=True)
    changes = body.model_dump(exclude_unset=True)
    board = service.update_board(db, board, changes)
    return service.board_read(db, board)


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(board_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    service.delete_board(db, service.get_board(db, ctx, board_id, write=True))


@router.get("/{board_id}/archived", response_model=list[CardSummary])
def archived(board_id: int, ctx: WorkspaceCtx, db: DbSession) -> list[CardSummary]:
    return service.archived_cards(db, service.get_board(db, ctx, board_id))


# --- Lists ---


@router.post("/{board_id}/lists", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_list(board_id: int, body: ListCreate, ctx: WorkspaceCtx, db: DbSession) -> ListRead:
    board = service.get_board(db, ctx, board_id, write=True)
    return ListRead.model_validate(service.create_list(db, board, body.title, body.index))


@router.patch("/{board_id}/lists/{list_id}", response_model=ListRead)
def update_list(
    board_id: int, list_id: int, body: ListUpdate, ctx: WorkspaceCtx, db: DbSession
) -> ListRead:
    board = service.get_board(db, ctx, board_id, write=True)
    row = service.get_list(db, board, list_id)
    updated = service.update_list(db, board, row, body.model_dump(exclude_unset=True))
    return ListRead.model_validate(updated)


@router.delete("/{board_id}/lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(board_id: int, list_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    board = service.get_board(db, ctx, board_id, write=True)
    service.delete_list(db, board, service.get_list(db, board, list_id))


@router.post("/{board_id}/lists/{list_id}/sort", status_code=status.HTTP_204_NO_CONTENT)
def sort_list(
    board_id: int, list_id: int, body: ListSort, ctx: WorkspaceCtx, db: DbSession
) -> None:
    board = service.get_board(db, ctx, board_id, write=True)
    service.sort_list(db, board, service.get_list(db, board, list_id), body.by)


@router.post("/{board_id}/lists/{list_id}/archive-cards", status_code=status.HTTP_204_NO_CONTENT)
def archive_list_cards(board_id: int, list_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    board = service.get_board(db, ctx, board_id, write=True)
    service.archive_list_cards(db, board, service.get_list(db, board, list_id))


# --- Cards ---


@router.post("/{board_id}/cards", response_model=CardRead, status_code=status.HTTP_201_CREATED)
def create_card(board_id: int, body: CardCreate, ctx: WorkspaceCtx, db: DbSession) -> CardRead:
    board = service.get_board(db, ctx, board_id, write=True)
    card = service.create_card(db, board, body.list_id, body.title, body.index)
    return service.card_read(db, card)


@router.get("/{board_id}/cards/{card_id}", response_model=CardRead)
def get_card(board_id: int, card_id: int, ctx: WorkspaceCtx, db: DbSession) -> CardRead:
    board = service.get_board(db, ctx, board_id)
    return service.card_read(db, service.get_card(db, board, card_id))


@router.patch("/{board_id}/cards/{card_id}", response_model=CardRead)
def update_card(
    board_id: int, card_id: int, body: CardUpdate, ctx: WorkspaceCtx, db: DbSession
) -> CardRead:
    board = service.get_board(db, ctx, board_id, write=True)
    card = service.get_card(db, board, card_id)
    changes = body.model_dump(exclude_unset=True)
    for key in ("checklists", "attachments"):
        if key in changes:
            changes[key] = [item.model_dump() for item in getattr(body, key)]
    updated = service.update_card(db, board, card, changes)
    return service.card_read(db, updated)


@router.post(
    "/{board_id}/cards/{card_id}/copy",
    response_model=CardRead,
    status_code=status.HTTP_201_CREATED,
)
def copy_card(
    board_id: int, card_id: int, body: CardCopy, ctx: WorkspaceCtx, db: DbSession
) -> CardRead:
    board = service.get_board(db, ctx, board_id, write=True)
    copy = service.copy_card(db, board, service.get_card(db, board, card_id), body)
    return service.card_read(db, copy)


@router.delete("/{board_id}/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(board_id: int, card_id: int, ctx: WorkspaceCtx, db: DbSession) -> None:
    board = service.get_board(db, ctx, board_id, write=True)
    service.delete_card(db, board, service.get_card(db, board, card_id))


@router.post(
    "/{board_id}/cards/{card_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
def add_comment(
    board_id: int, card_id: int, body: CommentCreate, ctx: WorkspaceCtx, db: DbSession
) -> CommentRead:
    board = service.get_board(db, ctx, board_id, write=True)
    card = service.get_card(db, board, card_id)
    return CommentRead.model_validate(service.add_comment(db, board, card, body.text))


@router.delete(
    "/{board_id}/cards/{card_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_comment(
    board_id: int, card_id: int, comment_id: int, ctx: WorkspaceCtx, db: DbSession
) -> None:
    board = service.get_board(db, ctx, board_id, write=True)
    service.delete_comment(db, service.get_card(db, board, card_id), comment_id)
