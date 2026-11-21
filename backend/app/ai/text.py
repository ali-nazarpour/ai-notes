"""
Text processing for retrieval, aware of Persian and English.

normalize()  unifies spelling variants (Arabic vs Persian letters, digits, diacritics,
             zero-width non-joiners) so "كتاب" and "کتاب", or "۱۲" and "12", match.
tokenize()   splits into lower-cased word tokens without stop words, with a light
             suffix strip (Persian plural "ها", English plural "s").
chunk_text() splits long text into overlapping passages along paragraph boundaries.
"""

import re
import unicodedata

_CHAR_MAP = str.maketrans(
    {
        "ي": "ی",
        "ى": "ی",
        "ك": "ک",
        "ة": "ه",
        "ۀ": "ه",
        "أ": "ا",
        "إ": "ا",
        "ٱ": "ا",
        "ؤ": "و",
        "‌": "",  # zero-width non-joiner
        "‏": "",
        "‎": "",
        **{chr(0x06F0 + i): str(i) for i in range(10)},  # Persian digits
        **{chr(0x0660 + i): str(i) for i in range(10)},  # Arabic digits
    }
)
_DIACRITICS = re.compile(r"[\u064b-\u065f\u0670\u0640]")
_TOKEN = re.compile(r"\w+", re.UNICODE)

_STOPWORDS = frozenset(
    """
    a an and are as at be but by for from has have i in is it its me my of on or our so
    that the their them there these they this to was we were what when where which who why
    will with you your do does did can could should would about into than then just also
    how all any more most some such not no only own same too very
    و در به از که این آن با را برای تا یا هم اما اگر پس چون نیز بر هر همه چه چی کی کجا چرا
    است هست بود شد شود می نمی ها های ای یک دیگر خود من تو او ما شما آنها ایشان باید شاید
    کرد کرده کند کنم کنید کنند داشت دارد دارم داریم چطور چگونه چند کدام
    """.split()  # noqa: SIM905
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_CHAR_MAP)
    return _DIACRITICS.sub("", text).lower()


def _stem(token: str) -> str:
    for suffix in ("هایی", "های", "ها"):
        if token.endswith(suffix) and len(token) - len(suffix) >= 2:
            return token[: -len(suffix)]
    if token.isascii() and len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    tokens = []
    for token in _TOKEN.findall(normalize(text)):
        if token in _STOPWORDS or (len(token) < 2 and not token.isdigit()):
            continue
        tokens.append(_stem(token))
    return tokens


def chunk_text(text: str, size: int = 1200, overlap: int = 150) -> list[str]:
    """Splits text into passages of about `size` characters, preferring paragraph breaks."""
    text = text.strip()
    if len(text) <= size:
        return [text] if text else []

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        pieces = (
            [paragraph]
            if len(paragraph) <= size
            else [paragraph[i : i + size] for i in range(0, len(paragraph), size - overlap)]
        )
        for piece in pieces:
            if current and len(current) + len(piece) + 2 > size:
                chunks.append(current)
                current = current[-overlap:] + "\n" + piece if overlap else piece
            else:
                current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks


def excerpt(text: str, length: int) -> str:
    """A one-line preview: whitespace collapsed, cut at a word boundary."""
    flat = " ".join(text.split())
    if len(flat) <= length:
        return flat
    cut = flat[:length].rsplit(" ", 1)[0]
    return (cut or flat[:length]) + "…"
