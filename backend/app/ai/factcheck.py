"""
Deterministic checks on model translations between English and Persian.

Small local models sometimes shift weekday names when translating whole sentences
(for example "Friday" -> "Thursday"). Weekdays are a closed set, so the translation can
be checked against the source: when both mention the same number of weekdays, the
output's names are replaced, in order, by the correct translations of the source's.
"""

import re

# Index 0 = Saturday … 6 = Friday (the Persian week order).
_EN_DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]
_FA_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]

_EN_PATTERN = re.compile(r"\b(" + "|".join(_EN_DAYS) + r")\b", re.IGNORECASE)

ZWNJ = chr(0x200C)  # zero-width non-joiner, used inside Persian compound words
# Arabic-script block U+0600..U+06FF, built with chr() to keep the source plain ASCII here.
_PERSIAN_RANGE = f"{chr(0x0600)}-{chr(0x06FF)}"
_PERSIAN_LETTER = f"[{_PERSIAN_RANGE}]"

# Persian names may be written with a space, a ZWNJ or nothing between the parts.
_SEP = f"[\\s{ZWNJ}]?"
_FA_FORMS = [
    "شنبه",
    f"یک{_SEP}شنبه",
    f"دو{_SEP}شنبه",
    f"سه{_SEP}شنبه",
    f"چهار{_SEP}شنبه",
    f"پنج{_SEP}شنبه",
    "جمعه",
]
# Longest forms first so "سه شنبه" is not read as "شنبه". A match must not be preceded by a
# Persian letter or ZWNJ (so "شنبه" inside "یکشنبه" does not count).
_FA_PATTERN = re.compile(
    f"(?<![{_PERSIAN_RANGE}{ZWNJ}])("
    + "|".join(sorted(_FA_FORMS, key=len, reverse=True))
    + f")(?!{_PERSIAN_LETTER})"
)


def _fa_index(word: str) -> int:
    compact = re.sub(f"[\\s{ZWNJ}]", "", word)
    return [d.replace(ZWNJ, "") for d in _FA_DAYS].index(compact)


def _mentions(text: str, language: str) -> list[int]:
    if language == "en":
        return [_EN_DAYS.index(m.group(1).lower()) for m in _EN_PATTERN.finditer(text)]
    return [_fa_index(m.group(1)) for m in _FA_PATTERN.finditer(text)]


def _english_name(index: int, original: str) -> str:
    name = _EN_DAYS[index]
    return name.upper() if original.isupper() else name.capitalize()


def fix_weekdays(source: str, translation: str, source_lang: str, target_lang: str) -> str:
    """Corrects weekday names in an English<->Persian translation. Other pairs pass through."""
    if {source_lang, target_lang} != {"en", "fa"}:
        return translation
    expected = _mentions(source, source_lang)
    if not expected:
        return translation
    pattern = _EN_PATTERN if target_lang == "en" else _FA_PATTERN
    found = list(pattern.finditer(translation))
    if len(found) != len(expected):
        return translation  # cannot align safely

    days = iter(expected)

    def replace(match: re.Match[str]) -> str:
        index = next(days)
        if target_lang == "en":
            return _english_name(index, match.group(1))
        return match.group(1) if _fa_index(match.group(1)) == index else _FA_DAYS[index]

    return pattern.sub(replace, translation)


def detect_en_or_fa(text: str) -> str | None:
    """'fa' if the text is mostly Persian/Arabic script, 'en' if mostly Latin, else None."""
    persian = len(re.findall(_PERSIAN_LETTER, text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if persian > latin * 2:
        return "fa"
    if latin > persian * 2:
        return "en"
    return None
