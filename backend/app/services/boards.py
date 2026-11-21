"""
Kanban boards.

Ordering: lists and (non-archived) cards are numbered 0..n-1 inside their parent. Moving
something removes it from its old sequence, inserts it at the requested index and renumbers
the affected sequences, so positions are always dense and clients only send indexes.
"""

import secrets
from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import InvalidInputError, NotFoundError
from app.models import Board, BoardCard, BoardList, CardComment
from app.schemas.board import (
    BoardCreate,
    BoardRead,
    BoardSummary,
    CardCopy,
    CardRead,
    CardSummary,
    CommentRead,
    ListRead,
    SortBy,
)
from app.services.access import Ctx, check

# Lists created by each template, per UI language.
TEMPLATES: dict[str, dict[str, list[str]]] = {
    "blank": {"en": [], "fa": []},
    "kanban": {"en": ["To do", "Doing", "Done"], "fa": ["برای انجام", "در حال انجام", "انجام شد"]},
    "project": {
        "en": ["Backlog", "To do", "In progress", "Review", "Done"],
        "fa": ["ایده‌ها", "برای انجام", "در حال انجام", "بازبینی", "انجام شد"],
    },
    "weekly": {
        "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend"],
        "fa": ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"],
    },
    "personal": {
        "en": ["Ideas", "This week", "Today", "Done"],
        "fa": ["ایده‌ها", "این هفته", "امروز", "انجام شد"],
    },
}

# Like Trello: six colored labels without names, ready to use.
DEFAULT_LABEL_COLORS = ("green", "amber", "orange", "red", "violet", "blue")


def _new_id() -> str:
    return secrets.token_hex(4)


def _touch(board: Board) -> None:
    board.updated_at = datetime.now(UTC)


# --- Loading with ownership checks ---


def _board_missing() -> NotFoundError:
    return NotFoundError("Board not found.", code="board_not_found")


def get_board(db: Session, ctx: Ctx, board_id: int, *, write: bool = False) -> Board:
    """Members of the board's workspace and people it was shared with can open it."""
    board = db.get(Board, board_id)
    if board is None:
        raise _board_missing()
    check(db, ctx, "board", board.workspace_id, board.id, write=write, missing=_board_missing())
    return board


def get_list(db: Session, board: Board, list_id: int) -> BoardList:
    row = db.get(BoardList, list_id)
    if row is None or row.board_id != board.id:
        raise NotFoundError("List not found.", code="list_not_found")
    return row


def get_card(db: Session, board: Board, card_id: int) -> BoardCard:
    card = db.get(BoardCard, card_id)
    if card is None or card.board_id != board.id:
        raise NotFoundError("Card not found.", code="card_not_found")
    return card


# --- Serialization ---


def _summary(card: BoardCard, comment_count: int) -> CardSummary:
    checklists = card.checklists or []
    items = [item for checklist in checklists for item in checklist.get("items", [])]
    return CardSummary(
        id=card.id,
        list_id=card.list_id,
        title=card.title,
        position=card.position,
        label_ids=card.label_ids or [],
        start_date=card.start_date,
        due_date=card.due_date,
        due_done=card.due_done,
        cover=card.cover,
        archived=card.archived,
        has_description=bool(card.description_text.strip()),
        checklist_done=sum(1 for item in items if item.get("done")),
        checklist_total=len(items),
        comment_count=comment_count,
        attachment_count=len(card.attachments or []),
        created_at=card.created_at,
        updated_at=card.updated_at,
    )


def _comment_counts(db: Session, card_ids: list[int]) -> dict[int, int]:
    if not card_ids:
        return {}
    rows = db.execute(
        select(CardComment.card_id, func.count())
        .where(CardComment.card_id.in_(card_ids))
        .group_by(CardComment.card_id)
    ).all()
    return {int(card_id): int(count) for card_id, count in rows}


def card_read(db: Session, card: BoardCard) -> CardRead:
    comments = db.scalars(
        select(CardComment)
        .where(CardComment.card_id == card.id)
        .order_by(CardComment.created_at.desc(), CardComment.id.desc())
    ).all()
    summary = _summary(card, len(comments))
    return CardRead(
        **summary.model_dump(),
        description=card.description,
        description_text=card.description_text,
        checklists=card.checklists or [],
        attachments=card.attachments or [],
        comments=[CommentRead.model_validate(c) for c in comments],
    )


def list_boards(db: Session, ws_id: int) -> list[BoardSummary]:
    boards = db.scalars(
        select(Board).where(Board.workspace_id == ws_id).order_by(Board.updated_at.desc())
    ).all()
    ids = [b.id for b in boards]
    list_counts = dict(
        db.execute(
            select(BoardList.board_id, func.count())
            .where(BoardList.board_id.in_(ids))
            .group_by(BoardList.board_id)
        ).all()
    )
    card_counts = dict(
        db.execute(
            select(BoardCard.board_id, func.count())
            .where(BoardCard.board_id.in_(ids), BoardCard.archived.is_(False))
            .group_by(BoardCard.board_id)
        ).all()
    )
    return [
        BoardSummary.model_validate(board).model_copy(
            update={
                "list_count": list_counts.get(board.id, 0),
                "card_count": card_counts.get(board.id, 0),
            }
        )
        for board in boards
    ]


def _lists(db: Session, board_id: int) -> list[BoardList]:
    return list(
        db.scalars(
            select(BoardList)
            .where(BoardList.board_id == board_id)
            .order_by(BoardList.position, BoardList.id)
        )
    )


def _cards(db: Session, list_id: int) -> list[BoardCard]:
    return list(
        db.scalars(
            select(BoardCard)
            .where(BoardCard.list_id == list_id, BoardCard.archived.is_(False))
            .order_by(BoardCard.position, BoardCard.id)
        )
    )


def board_read(db: Session, board: Board) -> BoardRead:
    lists = _lists(db, board.id)
    cards = db.scalars(
        select(BoardCard)
        .where(BoardCard.board_id == board.id, BoardCard.archived.is_(False))
        .order_by(BoardCard.position, BoardCard.id)
    ).all()
    counts = _comment_counts(db, [c.id for c in cards])
    by_list: dict[int, list[CardSummary]] = defaultdict(list)
    for card in cards:
        by_list[card.list_id].append(_summary(card, counts.get(card.id, 0)))
    return BoardRead(
        **BoardSummary.model_validate(board)
        .model_copy(update={"list_count": len(lists), "card_count": len(cards)})
        .model_dump(),
        labels=board.labels or [],
        lists=[
            ListRead.model_validate(row).model_copy(update={"cards": by_list.get(row.id, [])})
            for row in lists
        ],
    )


# --- Boards ---


def create_board(db: Session, ctx: Ctx, body: BoardCreate, language: str) -> Board:
    ctx.require_edit()
    board = Board(
        user_id=ctx.user_id,
        workspace_id=ctx.ws_id,
        title=body.title,
        background=body.background,
        labels=[{"id": _new_id(), "name": "", "color": c} for c in DEFAULT_LABEL_COLORS],
    )
    db.add(board)
    db.flush()
    names = TEMPLATES[body.template].get(language, TEMPLATES[body.template]["en"])
    for position, name in enumerate(names):
        db.add(BoardList(board_id=board.id, title=name, position=position))
    db.commit()
    db.refresh(board)
    return board


def update_board(db: Session, board: Board, changes: dict[str, Any]) -> Board:
    if "labels" in changes:
        valid = {label["id"] for label in changes["labels"]}
        if len(valid) != len(changes["labels"]):
            raise InvalidInputError("Label ids must be unique.", code="validation_error")
        # Cards lose labels that no longer exist.
        for card in db.scalars(select(BoardCard).where(BoardCard.board_id == board.id)):
            if card.label_ids and any(i not in valid for i in card.label_ids):
                card.label_ids = [i for i in card.label_ids if i in valid]
    for field, value in changes.items():
        setattr(board, field, value)
    db.commit()
    db.refresh(board)
    return board


def delete_board(db: Session, board: Board) -> None:
    db.delete(board)
    db.commit()


# --- Lists ---


def _renumber(rows: list[Any]) -> None:
    for position, row in enumerate(rows):
        if row.position != position:
            row.position = position


def _insert(rows: list[Any], item: Any, index: int | None) -> None:
    rows.insert(len(rows) if index is None else min(index, len(rows)), item)
    _renumber(rows)


def create_list(db: Session, board: Board, title: str, index: int | None) -> BoardList:
    lists = _lists(db, board.id)  # before adding: autoflush would include the new row
    row = BoardList(board_id=board.id, title=title)
    db.add(row)
    _insert(lists, row, index)
    _touch(board)
    db.commit()
    db.refresh(row)
    return row


def update_list(db: Session, board: Board, row: BoardList, changes: dict[str, Any]) -> BoardList:
    index = changes.pop("index", None)
    if "wip_limit" in changes and not changes["wip_limit"]:
        changes["wip_limit"] = None
    for field, value in changes.items():
        setattr(row, field, value)
    if index is not None:
        lists = [item for item in _lists(db, board.id) if item.id != row.id]
        _insert(lists, row, index)
    _touch(board)
    db.commit()
    db.refresh(row)
    return row


def delete_list(db: Session, board: Board, row: BoardList) -> None:
    db.delete(row)
    db.flush()
    _renumber(_lists(db, board.id))
    _touch(board)
    db.commit()


def sort_list(db: Session, board: Board, row: BoardList, by: SortBy) -> None:
    cards = _cards(db, row.id)
    if by == "title":
        cards.sort(key=lambda c: c.title.casefold())
    elif by == "due":
        cards.sort(key=lambda c: (c.due_date is None, c.due_date or date.max))
    elif by == "newest":
        cards.sort(key=lambda c: (c.created_at, c.id), reverse=True)
    else:
        cards.sort(key=lambda c: (c.created_at, c.id))
    _renumber(cards)
    _touch(board)
    db.commit()


def archive_list_cards(db: Session, board: Board, row: BoardList) -> int:
    cards = _cards(db, row.id)
    for card in cards:
        card.archived = True
    _touch(board)
    db.commit()
    return len(cards)


# --- Cards ---


def create_card(
    db: Session, board: Board, list_id: int, title: str, index: int | None
) -> BoardCard:
    target = get_list(db, board, list_id)
    siblings = _cards(db, target.id)  # before adding: autoflush would include the new card
    card = BoardCard(board_id=board.id, list_id=target.id, title=title, label_ids=[])
    db.add(card)
    _insert(siblings, card, index)
    _touch(board)
    db.commit()
    db.refresh(card)
    return card


def _move(db: Session, board: Board, card: BoardCard, list_id: int, index: int | None) -> None:
    target = get_list(db, board, list_id)
    old_list = card.list_id
    if old_list != target.id:
        _renumber([c for c in _cards(db, old_list) if c.id != card.id])
    card.list_id = target.id
    siblings = [c for c in _cards(db, target.id) if c.id != card.id]
    _insert(siblings, card, index)


def update_card(db: Session, board: Board, card: BoardCard, changes: dict[str, Any]) -> BoardCard:
    list_id = changes.pop("list_id", None)
    index = changes.pop("index", None)
    if "label_ids" in changes:
        valid = {label["id"] for label in board.labels or []}
        changes["label_ids"] = [i for i in dict.fromkeys(changes["label_ids"]) if i in valid]
    unarchive = changes.get("archived") is False and card.archived
    archive = changes.get("archived") is True and not card.archived
    for field, value in changes.items():
        setattr(card, field, value)
    db.flush()
    if archive:
        _renumber(_cards(db, card.list_id))
    elif unarchive:
        _move(db, board, card, card.list_id, None)  # back at the end of its list
    if list_id is not None or index is not None:
        if card.archived:
            raise InvalidInputError("Restore the card before moving it.", code="card_archived")
        _move(db, board, card, list_id or card.list_id, index)
    _touch(board)
    db.commit()
    db.refresh(card)
    return card


def copy_card(db: Session, board: Board, card: BoardCard, body: CardCopy) -> BoardCard:
    target = get_list(db, board, body.list_id or card.list_id)
    siblings = _cards(db, target.id)
    copy = BoardCard(
        board_id=board.id,
        list_id=target.id,
        title=body.title or card.title,
        description=card.description,
        description_text=card.description_text,
        label_ids=list(card.label_ids or []),
        start_date=card.start_date,
        due_date=card.due_date,
        due_done=card.due_done,
        cover=card.cover,
        checklists=[
            {**c, "items": [dict(i) for i in c.get("items", [])]} for c in card.checklists or []
        ],
        attachments=[dict(a) for a in card.attachments or []],
    )
    db.add(copy)
    if body.index is None and target.id == card.list_id:
        index: int | None = card.position + 1  # right below the original
    else:
        index = body.index
    _insert(siblings, copy, index)
    _touch(board)
    db.commit()
    db.refresh(copy)
    return copy


def delete_card(db: Session, board: Board, card: BoardCard) -> None:
    list_id = card.list_id
    db.delete(card)
    db.flush()
    _renumber(_cards(db, list_id))
    _touch(board)
    db.commit()


def archived_cards(db: Session, board: Board) -> list[CardSummary]:
    cards = db.scalars(
        select(BoardCard)
        .where(BoardCard.board_id == board.id, BoardCard.archived.is_(True))
        .order_by(BoardCard.updated_at.desc())
    ).all()
    counts = _comment_counts(db, [c.id for c in cards])
    return [_summary(card, counts.get(card.id, 0)) for card in cards]


def add_comment(db: Session, board: Board, card: BoardCard, text: str) -> CardComment:
    comment = CardComment(card_id=card.id, text=text)
    db.add(comment)
    _touch(board)
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, card: BoardCard, comment_id: int) -> None:
    comment = db.get(CardComment, comment_id)
    if comment is None or comment.card_id != card.id:
        raise NotFoundError("Comment not found.", code="comment_not_found")
    db.delete(comment)
    db.commit()
