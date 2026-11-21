from app.ai.factcheck import detect_en_or_fa, fix_weekdays


def test_fixes_shifted_weekday_english_to_persian():
    source = "The train leaves at 8 am on Friday."
    wrong = "قطار ساعت ۸ صبح پنج‌شنبه حرکت می‌کند."
    assert fix_weekdays(source, wrong, "en", "fa") == "قطار ساعت ۸ صبح جمعه حرکت می‌کند."


def test_fixes_several_weekdays_in_order():
    source = "The meeting is on Friday, not Thursday."
    wrong = "جلسه در روز پنجشنبه است، نه چهارشنبه."
    assert fix_weekdays(source, wrong, "en", "fa") == "جلسه در روز جمعه است، نه پنجشنبه."


def test_keeps_correct_persian_spelling_variants():
    source = "See you on Tuesday."
    good = "سه شنبه می‌بینمت."
    assert fix_weekdays(source, good, "en", "fa") == good


def test_does_not_confuse_saturday_with_compound_names():
    source = "Sunday and Saturday"
    output = "یکشنبه و جمعه"
    assert fix_weekdays(source, output, "en", "fa") == "یکشنبه و شنبه"


def test_fixes_persian_to_english_and_keeps_case():
    source = "کلاس دوشنبه است."
    assert fix_weekdays(source, "The class is on Sunday.", "fa", "en") == "The class is on Monday."


def test_leaves_output_alone_when_counts_differ_or_other_languages():
    assert fix_weekdays("Friday", "جمعه و شنبه", "en", "fa") == "جمعه و شنبه"
    assert fix_weekdays("Friday", "Donnerstag", "en", "de") == "Donnerstag"


def test_detects_script():
    assert detect_en_or_fa("سلام دنیا") == "fa"
    assert detect_en_or_fa("Hello world") == "en"
    assert detect_en_or_fa("") is None
