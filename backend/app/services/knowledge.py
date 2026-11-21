"""
Everything the chatbot can read in a workspace, as plain text items.

Notes keep their own ids (so existing ``[note:ID]`` citations stay valid). Other items
(documentation pages, blog posts, projects, boards, the task list) get the next free ids
after the highest note id, and a map from that id to the item's kind and URL, so the
answer can link to them.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.retrieval import NoteText
from app.models import (
    BlogPost,
    Board,
    BoardCard,
    BoardList,
    DocPage,
    DocSpace,
    DriveItem,
    LangCard,
    LangDeck,
    LangSong,
    Project,
    SlideDeck,
    Task,
)
from app.schemas.chat import ChatScope, VaultHint
from app.services import notes as notes_service


@dataclass(frozen=True)
class SourceRef:
    kind: str
    url: str


def _project_text(project: Project) -> str:
    lines = [project.summary, project.description_text]
    lines.append(f"Status: {project.status}. Priority: {project.priority}.")
    if project.start_date or project.end_date:
        lines.append(f"Schedule: {project.start_date or '?'} to {project.end_date or '?'}.")
    if project.budget is not None:
        spent = sum(float(e.get("amount") or 0) for e in project.expenses or [])
        lines.append(f"Budget: {project.budget} {project.currency}; spent {spent:g}.")
    if project.client:
        lines.append(f"Client: {project.client}")
    for milestone in project.milestones or []:
        state = "done" if milestone.get("done") else "open"
        lines.append(
            f"Milestone: {milestone.get('title', '')} ({milestone.get('date') or '-'}, {state})"
        )
    for member in project.members or []:
        lines.append(f"Member: {member.get('name', '')} - {member.get('role', '')}")
    for note in project.notes or []:
        lines.append(f"Note: {note.get('text', '')}")
    for repo in project.repositories or []:
        lines.append(f"Repository: {repo.get('url', '')}")
    return "\n".join(line for line in lines if line)


def gather(
    db: Session, ws_id: int, scope: ChatScope, vault: list[VaultHint] | None = None
) -> tuple[list[NoteText], dict[int, SourceRef]]:
    items: list[NoteText] = []
    refs: dict[int, SourceRef] = {}
    sources = set(scope.sources)
    if "notes" in sources:
        items.extend(notes_service.notes_for_scope(db, ws_id, scope))
    next_id = max((item.id for item in items), default=0) + 1

    def add(kind: str, url: str, title: str, text: str) -> None:
        nonlocal next_id
        if not text.strip():
            return
        items.append(NoteText(id=next_id, title=title, content=text))
        refs[next_id] = SourceRef(kind, url)
        next_id += 1

    if "docs" in sources:
        rows = db.execute(
            select(DocPage.id, DocPage.title, DocPage.content, DocSpace.id, DocSpace.title)
            .join(DocSpace, DocSpace.id == DocPage.space_id)
            .where(DocSpace.workspace_id == ws_id)
            .order_by(DocPage.updated_at.desc())
        ).all()
        for page_id, title, content, space_id, space_title in rows:
            add("doc", f"/docs/{space_id}/{page_id}", f"{space_title} › {title}", content)

    if "blog" in sources:
        for post in db.scalars(
            select(BlogPost).where(BlogPost.workspace_id == ws_id).order_by(BlogPost.id.desc())
        ):
            add("post", f"/blog/{post.id}", post.title, f"{post.excerpt}\n{post.content}")

    if "projects" in sources:
        for project in db.scalars(select(Project).where(Project.workspace_id == ws_id)):
            add("project", f"/projects/{project.id}", project.name, _project_text(project))

    if "boards" in sources:
        for board in db.scalars(select(Board).where(Board.workspace_id == ws_id)):
            card_rows = db.execute(
                select(
                    BoardList.title,
                    BoardCard.title,
                    BoardCard.description_text,
                    BoardCard.due_date,
                    BoardCard.due_done,
                )
                .join(BoardCard, BoardCard.list_id == BoardList.id)
                .where(BoardList.board_id == board.id, BoardCard.archived.is_(False))
                .order_by(BoardList.position, BoardCard.position)
            ).all()
            lines = []
            for list_title, card_title, text, due, done in card_rows:
                extra = f" (due {due}{', done' if done else ''})" if due else ""
                lines.append(f"[{list_title}] {card_title}{extra}")
                if text:
                    lines.append(f"  {text[:400]}")
            add("board", f"/boards/{board.id}", f"Board: {board.title}", "\n".join(lines))

    if "tasks" in sources:
        tasks = db.scalars(
            select(Task).where(Task.workspace_id == ws_id).order_by(Task.is_done, Task.due_date)
        ).all()
        lines = [
            f"- [{'x' if t.is_done else ' '}] {t.title}"
            + (f" (due {t.due_date})" if t.due_date else "")
            for t in tasks
        ]
        add("tasks", "/tasks", "Task list", "\n".join(lines))
    if "slides" in sources:
        for deck in db.scalars(select(SlideDeck).where(SlideDeck.workspace_id == ws_id)):
            lines = []
            for number, slide in enumerate(deck.slides or [], start=1):
                if not isinstance(slide, dict):
                    continue
                parts = [slide.get(k) or "" for k in ("title", "subtitle", "body", "body2")]
                text = " ".join(" ".join(str(p).split()) for p in parts if p)
                if text:
                    lines.append(f"Slide {number}: {text}")
            add("deck", f"/slides/{deck.id}", f"Presentation: {deck.title}", "\n".join(lines))

    if "drive" in sources:
        drive_rows = db.scalars(
            select(DriveItem)
            .where(DriveItem.workspace_id == ws_id, DriveItem.trashed_at.is_(None))
            .order_by(DriveItem.updated_at.desc())
            .limit(500)
        ).all()
        names = {r.id: r.name for r in drive_rows if r.is_folder}
        lines = [
            f"- {'Folder' if r.is_folder else 'File'}: {r.name}"
            + (f" (in {names[r.parent_id]})" if r.parent_id in names else "")
            + (f", {round(r.size / 1024)} KB" if not r.is_folder else "")
            + (f" — {r.description}" if r.description else "")
            for r in drive_rows
        ]
        add("drive", "/drive", "Drive: files and folders", "\n".join(lines))

    if "learn" in sources:
        for lang_deck in db.scalars(select(LangDeck).where(LangDeck.workspace_id == ws_id)):
            cards = db.scalars(
                select(LangCard).where(LangCard.deck_id == lang_deck.id).limit(400)
            ).all()
            lines = [
                f"- {c.front} = {c.back}" + (f" (e.g. {c.example})" if c.example else "")
                for c in cards
            ]
            add(
                "lang_deck",
                f"/learn/decks/{lang_deck.id}",
                f"Flashcards: {lang_deck.name} ({lang_deck.source_lang} → {lang_deck.target_lang})",
                "\n".join(lines),
            )
        for song in db.scalars(select(LangSong).where(LangSong.workspace_id == ws_id)):
            lyrics = "\n".join(
                f"{line.get('text', '')} — {line.get('translation', '')}".strip(" —")
                for line in song.lines or []
                if isinstance(line, dict)
            )
            add("song", f"/learn/songs/{song.id}", f"Song: {song.title} — {song.artist}", lyrics)

    if "passwords" in sources and vault:
        lines = []
        for entry in vault:
            parts = [f"{entry.title or '(no name)'} ({entry.type})"]
            if entry.username:
                parts.append(f"username: {entry.username}")
            if entry.url:
                parts.append(f"site: {entry.url}")
            if entry.folder:
                parts.append(f"folder: {entry.folder}")
            lines.append("- " + ", ".join(parts))
        add(
            "passwords",
            "/passwords",
            "Saved passwords",
            "Names, usernames and sites of saved accounts. The passwords themselves are never "
            "shared; they can be copied in the password manager.\n" + "\n".join(lines),
        )
    return items, refs
