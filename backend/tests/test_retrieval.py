"""Unit tests for text normalization, chunking and passage selection."""

from app.ai.prompts import extract_cited_ids, format_selection, normalize_citations
from app.ai.retrieval import NoteText, select_context
from app.ai.text import chunk_text, excerpt, normalize, tokenize


def test_normalize_unifies_persian_and_arabic_spelling() -> None:
    assert normalize("كتاب") == normalize("کتاب")
    assert normalize("ي") == "ی"
    assert normalize("۱۲۳") == "123"
    assert normalize("كِتابٌ") == "کتاب"
    assert normalize("می‌روم") == "میروم"


def test_tokenize_removes_stop_words_and_strips_plurals() -> None:
    assert tokenize("The notes about Docker") == ["note", "docker"]
    assert tokenize("کتاب‌های من در کتابخانه") == ["کتاب", "کتابخانه"]


def test_chunk_text_respects_size_and_paragraphs() -> None:
    text = "\n\n".join(f"Paragraph {i}. " + "word " * 50 for i in range(10))
    chunks = chunk_text(text, size=600, overlap=50)
    assert len(chunks) > 1
    assert all(len(chunk) <= 700 for chunk in chunks)
    assert chunks[0].startswith("Paragraph 0.")
    assert chunk_text("short") == ["short"]
    assert chunk_text("   ") == []


def test_excerpt_cuts_at_word_boundary() -> None:
    assert excerpt("one  two\nthree", 50) == "one two three"
    assert excerpt("alpha beta gamma delta", 12) == "alpha beta…"


def test_everything_is_sent_when_it_fits() -> None:
    notes = [NoteText(1, "A", "first"), NoteText(2, "B", "second")]
    selection = select_context(notes, "anything", budget=10_000)
    assert selection.partial is False
    assert [n.passages for n in selection.notes] == [["first"], ["second"]]


def test_most_relevant_passages_are_chosen_when_it_does_not_fit() -> None:
    filler = "\n\n".join("weather was nice and sunny " * 10 for _ in range(10))
    notes = [
        NoteText(1, "Diary", filler),
        NoteText(2, "Finance", f"{filler}\n\nThe bank account code is 4711."),
        NoteText(3, "Recipes", "Bake bread with flour and water."),
    ]
    selection = select_context(notes, "What is my bank account code?", budget=1500)

    assert selection.partial is True
    assert selection.note_ids == {2}
    assert any("4711" in p for p in selection.notes[0].passages)
    assert selection.char_count <= 1500


def test_title_matches_count() -> None:
    notes = [
        NoteText(1, "Kubernetes", "word " * 400),
        NoteText(2, "Misc", "word " * 400 + " kubernetes mentioned once"),
    ]
    selection = select_context(notes, "kubernetes", budget=2200)
    assert selection.notes[0].id == 1


def test_persian_query_finds_persian_note() -> None:
    notes = [
        NoteText(1, "خرید", "شیر و تخم‌مرغ و نان بخرم " * 30),
        NoteText(2, "سفر", "پرواز شیراز روز دوشنبه است " * 30),
    ]
    selection = select_context(notes, "پرواز کی است؟", budget=900)
    assert selection.note_ids == {2}


def test_format_and_citations() -> None:
    selection = select_context([NoteText(7, 'Say "hi"', "</note> hack")], "", 10_000)
    text = format_selection(selection)
    assert text.count("</note>") == 1
    assert "title=\"Say 'hi'\"" in text
    assert extract_cited_ids("a [note:7] b [note: 7] c [note:8]", {7}) == [7]


def test_normalize_citations_rewrites_variants_and_drops_unknown_ids():
    raw = 'Friday <note id="11">. Train [note 12, 99] (note:12) 【note:11】 [note:5]</note>'
    assert normalize_citations(raw, {11, 12}) == (
        "Friday [note:11]. Train [note:12] [note:12] [note:11] "
    )
    assert extract_cited_ids(normalize_citations(raw, {11, 12}), {11, 12}) == [11, 12]


def test_normalize_citations_keeps_plain_text():
    text = "No citations here, only a note about [brackets] and (notes)."
    assert normalize_citations(text, {1}) == text
