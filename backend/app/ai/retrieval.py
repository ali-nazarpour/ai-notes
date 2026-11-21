"""
Choosing which note text goes into a prompt.

The model can only read a limited amount of text (the character budget). Strategy:

1. If every candidate note fits in the budget, send all of them, complete. This is the
   most accurate option, because nothing is left out.
2. Otherwise split the notes into passages, rank the passages against the question with
   BM25 (a standard keyword-relevance formula; titles count double), and fill the budget
   with the best passages. The answer is then marked ``partial``.

This is keyword retrieval, not semantic (embedding) search: synonyms that share no words
with the question are not found. In exchange it needs no extra model and no vector store.
"""

import math
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.ai.text import chunk_text, tokenize

_K1 = 1.5
_B = 0.75
# Characters added around every note by the prompt formatting (tags and attributes).
_NOTE_OVERHEAD = 60


@dataclass(frozen=True)
class NoteText:
    id: int
    title: str
    content: str


@dataclass
class SelectedNote:
    id: int
    title: str
    passages: list[str]
    partial: bool


@dataclass
class Selection:
    notes: list[SelectedNote] = field(default_factory=list)
    partial: bool = False

    @property
    def note_ids(self) -> set[int]:
        return {note.id for note in self.notes}

    @property
    def char_count(self) -> int:
        return sum(sum(len(p) for p in n.passages) + _NOTE_OVERHEAD for n in self.notes)


@dataclass(frozen=True)
class _Passage:
    note: NoteText
    index: int
    text: str
    tokens: tuple[str, ...]


def _note_size(note: NoteText) -> int:
    return len(note.title) + len(note.content) + _NOTE_OVERHEAD


def rank_passages(
    notes: Sequence[NoteText], query: str, passage_size: int = 1200
) -> list[tuple[float, _Passage]]:
    passages: list[_Passage] = []
    for note in notes:
        title_tokens = tokenize(note.title)
        for index, text in enumerate(chunk_text(note.content, passage_size) or [""]):
            # The title is repeated so that a match in the title weighs more.
            tokens = (*title_tokens, *title_tokens, *tokenize(text))
            passages.append(_Passage(note, index, text, tokens))
    if not passages:
        return []

    query_terms = set(tokenize(query))
    average_length = sum(len(p.tokens) for p in passages) / len(passages) or 1.0
    document_frequency: Counter[str] = Counter()
    for passage in passages:
        document_frequency.update(set(passage.tokens) & query_terms)

    total = len(passages)
    scored: list[tuple[float, _Passage]] = []
    for passage in passages:
        counts = Counter(passage.tokens)
        length_norm = _K1 * (1 - _B + _B * len(passage.tokens) / average_length)
        score = 0.0
        for term in query_terms:
            frequency = counts.get(term, 0)
            if not frequency:
                continue
            df = document_frequency[term]
            idf = math.log(1 + (total - df + 0.5) / (df + 0.5))
            score += idf * frequency * (_K1 + 1) / (frequency + length_norm)
        scored.append((score, passage))
    scored.sort(key=lambda item: (-item[0], item[1].note.id, item[1].index))
    return scored


def select_context(notes: Sequence[NoteText], query: str, budget: int) -> Selection:
    if sum(_note_size(note) for note in notes) <= budget:
        return Selection(
            notes=[SelectedNote(n.id, n.title, [n.content], partial=False) for n in notes],
            partial=False,
        )

    chosen: dict[int, list[_Passage]] = {}
    used = 0
    for score, passage in rank_passages(notes, query):
        if score <= 0:
            break
        cost = len(passage.text) + (0 if passage.note.id in chosen else _NOTE_OVERHEAD)
        if used + cost > budget:
            continue
        chosen.setdefault(passage.note.id, []).append(passage)
        used += cost

    selected = []
    for note in notes:
        if note.id not in chosen:
            continue
        ordered = sorted(chosen[note.id], key=lambda p: p.index)
        whole = len(ordered) == len(chunk_text(note.content) or [""])
        selected.append(
            SelectedNote(note.id, note.title, [p.text for p in ordered], partial=not whole)
        )
    return Selection(notes=selected, partial=True)
