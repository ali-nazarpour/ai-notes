/**
 * Studying. Four modes:
 * - flashcards: spaced repetition; flip the card (Space), then answer 1-4
 *   (again / hard / good / easy). Cards still being learned come back in the same session.
 * - type: see the meaning, type the word (typos are forgiven).
 * - quiz: pick the right meaning out of four.
 * - listen: hear the word (text-to-speech) and write it down.
 * Practice modes (type, quiz, listen) do not change the review schedule.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { learnApi } from "../../api/v5";
import { useToast } from "../../components/Feedback";
import {
  CheckIcon,
  CloseIcon,
  FlameIcon,
  FlipIcon,
  GraduationIcon,
  HeadphonesIcon,
  KeyboardTypeIcon,
  PlayFilledIcon,
  QuizIcon,
  RefreshIcon,
  ShuffleIcon,
  SpeakerIcon,
  StarIcon,
} from "../../components/Icons";
import { EmptyState, Skeleton } from "../../components/ui";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { LangCard, LangDeck } from "../../types5";
import { learnKeys } from "./LearnPage";
import { checkAnswer, dirOf, formatDelay, shuffle, speak } from "./langs";

type Mode = "cards" | "type" | "quiz" | "listen";

export function StudyPage() {
  const { deckId } = useParams();
  const [params] = useSearchParams();
  const mode = (
    ["type", "quiz", "listen"].includes(params.get("mode") ?? "") ? params.get("mode") : "cards"
  ) as Mode;
  const id = deckId ? Number(deckId) : null;
  const { t } = useI18n();
  const decks = useQuery({ queryKey: learnKeys.decks, queryFn: learnApi.decks });
  const queue = useQuery({
    queryKey: ["learn-study", id, mode],
    queryFn: () => learnApi.study(id, mode === "cards" ? "due" : "all", mode === "cards" ? 200 : 40),
    staleTime: Infinity,
    gcTime: 0,
  });
  const byId = useMemo(() => new Map((decks.data ?? []).map((d) => [d.id, d])), [decks.data]);

  if (queue.isLoading || decks.isLoading) return <Skeleton rows={3} height={160} />;
  const cards = queue.data?.cards ?? [];
  const back = id ? `/learn/decks/${id}` : "/learn";
  if (!cards.length) {
    return (
      <div className="page study-page">
        <EmptyState
          icon={GraduationIcon}
          title={mode === "cards" ? t("learn.nothingDue") : t("learn.noCards")}
          hint={mode === "cards" ? t("learn.nothingDueHint") : undefined}
          action={
            <span className="row wrap center">
              <Link to={back} className="button">
                {t("common.back")}
              </Link>
              {mode === "cards" && id && (
                <Link to={`/learn/study/${id}?mode=quiz`} className="button primary">
                  <QuizIcon /> {t("learn.mode.quiz")}
                </Link>
              )}
            </span>
          }
        />
      </div>
    );
  }
  const deckFor = (card: LangCard) => byId.get(card.deck_id);
  const deck = id ? byId.get(id) : undefined;
  const props = {
    initial: cards,
    deckFor,
    back,
    title: deck ? `${deck.icon} ${deck.name}` : t("learn.allDecks"),
  };
  if (mode === "type") return <TypeSession {...props} listen={false} />;
  if (mode === "listen") return <TypeSession {...props} listen />;
  if (mode === "quiz") return <QuizSession {...props} />;
  return <CardSession {...props} />;
}

interface SessionProps {
  initial: LangCard[];
  deckFor: (card: LangCard) => LangDeck | undefined;
  back: string;
  title: string;
}

function SessionHeader({
  title,
  done,
  total,
  back,
  icon,
}: {
  title: string;
  done: number;
  total: number;
  back: string;
  icon: React.ReactNode;
}) {
  const { t, calendar } = useI18n();
  const navigate = useNavigate();
  return (
    <header className="study-head">
      <button
        type="button"
        className="icon-button"
        onClick={() => navigate(back)}
        aria-label={t("common.close")}
      >
        <CloseIcon />
      </button>
      <div className="study-progress" aria-label={t("learn.progressOf", { done, total })}>
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <span className="study-count small">
        {calendar.formatNumber(done)} / {calendar.formatNumber(total)}
      </span>
      <span className="study-title small muted hide-on-phone" dir="auto">
        {icon} {title}
      </span>
    </header>
  );
}

function Summary({
  reviewed,
  correct,
  back,
  again,
  seconds,
}: {
  reviewed: number;
  correct: number;
  back: string;
  again: () => void;
  seconds: number;
}) {
  const { t, calendar } = useI18n();
  const accuracy = reviewed ? Math.round((correct / reviewed) * 100) : 0;
  const stats = useQuery({ queryKey: learnKeys.stats, queryFn: learnApi.stats });
  return (
    <div className="study-summary">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <span className="study-summary-icon">🎉</span>
      <h1>{t("learn.sessionDone")}</h1>
      <div className="study-summary-stats">
        <span>
          <strong>{calendar.formatNumber(reviewed)}</strong>
          {t("learn.cardsReviewed")}
        </span>
        <span>
          <strong>{calendar.formatNumber(accuracy)}٪</strong>
          {t("learn.correct")}
        </span>
        <span>
          <strong>{calendar.formatNumber(Math.max(1, Math.round(seconds / 60)))}</strong>
          {t("learn.minutes")}
        </span>
        {stats.data && (
          <span className="flame">
            <strong>
              <FlameIcon /> {calendar.formatNumber(stats.data.streak)}
            </strong>
            {t("learn.dayStreak")}
          </span>
        )}
      </div>
      <div className="row wrap center">
        <Link to={back} className="button">
          {t("common.back")}
        </Link>
        <button type="button" className="primary" onClick={again}>
          <RefreshIcon /> {t("learn.again")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- flashcards

function CardSession({ initial, deckFor, back, title }: SessionProps) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const [queue, setQueue] = useState<LangCard[]>(initial);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reverse, setReverse] = useLocalStorage("learn.reverse", false);
  const [autoSpeak, setAutoSpeak] = useLocalStorage("learn.autoSpeak", true);
  const [total, setTotal] = useState(initial.length);
  const started = useRef(Date.now());
  const card = queue[0];
  const deck = card ? deckFor(card) : undefined;
  const source = deck?.source_lang ?? "en";
  const target = deck?.target_lang ?? "fa";

  useEffect(() => {
    if (card && autoSpeak && !reverse) speak(card.front, source);
  }, [card?.id, autoSpeak, reverse]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = useCallback(
    async (value: number) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const updated = await learnApi.review(card.id, value);
        setReviewed((n) => n + 1);
        if (value >= 3) setCorrect((n) => n + 1);
        setFlipped(false);
        setQueue((list) => {
          const rest = list.slice(1);
          // Still being learned and due soon: show it again later in this session.
          if (
            updated.state === "learning" &&
            updated.due_at &&
            Date.parse(updated.due_at) - Date.now() < 15 * 60_000
          ) {
            setTotal((n) => n + 1);
            const at = Math.min(rest.length, value === 1 ? 3 : 6);
            return [...rest.slice(0, at), updated, ...rest.slice(at)];
          }
          return rest;
        });
      } catch (err) {
        toast(errorMessage(err, i18n), "error");
      } finally {
        setBusy(false);
      }
    },
    [card, busy, toast, i18n],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea")) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!flipped) setFlipped(true);
        else void grade(3);
      } else if (flipped && ["1", "2", "3", "4"].includes(event.key)) {
        void grade(Number(event.key));
      } else if (event.key.toLowerCase() === "s" && card) {
        speak(card.front, source);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flipped, grade, card, source]);

  useEffect(() => {
    if (!card)
      void client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("learn-") && q.queryKey[0] !== "learn-study",
      });
  }, [card, client]);

  if (!card) {
    return (
      <div className="page study-page">
        <Summary
          reviewed={reviewed}
          correct={correct}
          back={back}
          seconds={(Date.now() - started.current) / 1000}
          again={() => window.location.reload()}
        />
      </div>
    );
  }

  const frontText = reverse ? card.back : card.front;
  const frontLang = reverse ? target : source;
  const grades = [
    { value: 1, label: t("learn.grade.again"), tone: "again" },
    { value: 2, label: t("learn.grade.hard"), tone: "hard" },
    { value: 3, label: t("learn.grade.good"), tone: "good" },
    { value: 4, label: t("learn.grade.easy"), tone: "easy" },
  ];

  return (
    <div className="page study-page">
      <SessionHeader
        title={title}
        done={reviewed}
        total={Math.max(total, reviewed + queue.length)}
        back={back}
        icon={<PlayFilledIcon />}
      />
      <div className="study-options">
        <button
          type="button"
          className={reverse ? "chip" : "chip"}
          aria-pressed={reverse}
          onClick={() => setReverse(!reverse)}
        >
          <ShuffleIcon /> {t("learn.reverse")}
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={autoSpeak}
          onClick={() => setAutoSpeak(!autoSpeak)}
        >
          <SpeakerIcon /> {t("learn.autoSpeak")}
        </button>
        <span className="study-state small" data-state={card.state}>
          {card.state === "new"
            ? t("learn.state.new")
            : card.state === "learning"
              ? t("learn.state.learning")
              : t("learn.state.review")}
        </span>
      </div>

      <div className="flashcard-scene">
        <button
          type="button"
          className="flashcard"
          data-flipped={flipped}
          onClick={() => setFlipped(!flipped)}
          aria-label={flipped ? t("learn.flipBack") : t("learn.showAnswer")}
        >
          <span className="flashcard-face flashcard-front" dir={dirOf(frontLang)}>
            {card.starred && (
              <span className="flashcard-star">
                <StarIcon filled />
              </span>
            )}
            <span className="flashcard-word">{frontText}</span>
            {!reverse && card.pronunciation && <span className="flashcard-ipa">{card.pronunciation}</span>}
            {!reverse && card.part_of_speech && <span className="pos">{card.part_of_speech}</span>}
            <span className="flashcard-hint small">
              <FlipIcon /> {t("learn.tapToFlip")}
            </span>
          </span>
          <span className="flashcard-face flashcard-back">
            <span className="flashcard-small" dir={dirOf(frontLang)}>
              {frontText}
            </span>
            <span className="flashcard-word" dir={dirOf(reverse ? source : target)}>
              {reverse ? card.front : card.back || "—"}
            </span>
            {reverse && card.pronunciation && <span className="flashcard-ipa">{card.pronunciation}</span>}
            {card.example && (
              <span className="flashcard-example">
                <span dir={dirOf(source)}>{card.example}</span>
                {card.example_translation && (
                  <span className="muted" dir={dirOf(target)}>
                    {card.example_translation}
                  </span>
                )}
              </span>
            )}
            {card.notes && (
              <span className="flashcard-notes small" dir="auto">
                {card.notes}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          className="icon-button flashcard-speak"
          onClick={() => speak(card.front, source)}
          title={t("learn.listen")}
          aria-label={t("learn.listen")}
        >
          <SpeakerIcon />
        </button>
      </div>

      {flipped ? (
        <div className="grade-row">
          {grades.map((g) => (
            <button
              key={g.value}
              type="button"
              className="grade"
              data-tone={g.tone}
              disabled={busy}
              onClick={() => void grade(g.value)}
            >
              <span className="grade-label">{g.label}</span>
              <span className="grade-delay small">
                {formatDelay(card.previews[String(g.value)] ?? 60, t, calendar.formatNumber)}
              </span>
              <kbd>{calendar.formatNumber(g.value)}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <div className="grade-row">
          <button type="button" className="primary show-answer" onClick={() => setFlipped(true)}>
            {t("learn.showAnswer")} <kbd>Space</kbd>
          </button>
        </div>
      )}
      <p className="hint study-keys">{t("learn.keysHint")}</p>
    </div>
  );
}

// ---------------------------------------------------------------- typing and listening

function TypeSession({ initial, deckFor, back, title, listen }: SessionProps & { listen: boolean }) {
  const { t, calendar } = useI18n();
  const [cards, setCards] = useState(() => shuffle(initial).slice(0, 25));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<"exact" | "close" | "wrong" | null>(null);
  const [correct, setCorrect] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const started = useRef(Date.now());
  const card = cards[index];
  const deck = card ? deckFor(card) : undefined;
  const source = deck?.source_lang ?? "en";
  const target = deck?.target_lang ?? "fa";

  useEffect(() => {
    if (card && listen) setTimeout(() => speak(card.front, source, 0.9), 250);
    input.current?.focus();
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!card) return;
    if (result) {
      setIndex((i) => i + 1);
      setAnswer("");
      setResult(null);
      return;
    }
    const verdict = checkAnswer(answer, card.front);
    setResult(verdict);
    if (verdict !== "wrong") setCorrect((n) => n + 1);
    if (!listen) speak(card.front, source);
  }

  if (!card) {
    return (
      <div className="page study-page">
        <Summary
          reviewed={cards.length}
          correct={correct}
          back={back}
          seconds={(Date.now() - started.current) / 1000}
          again={() => {
            setCards(shuffle(initial).slice(0, 25));
            setIndex(0);
            setCorrect(0);
            started.current = Date.now();
          }}
        />
      </div>
    );
  }

  return (
    <div className="page study-page">
      <SessionHeader
        title={title}
        done={index}
        total={cards.length}
        back={back}
        icon={listen ? <HeadphonesIcon /> : <KeyboardTypeIcon />}
      />
      <form className="type-card" onSubmit={submit} data-result={result ?? "none"}>
        <p className="type-prompt muted small">
          {listen ? t("learn.typeWhatYouHear") : t("learn.typeTheWord")}
        </p>
        {listen ? (
          <div className="listen-buttons">
            <button
              type="button"
              className="listen-play"
              onClick={() => speak(card.front, source, 0.9)}
              aria-label={t("learn.listen")}
            >
              <SpeakerIcon />
            </button>
            <button type="button" className="ghost small" onClick={() => speak(card.front, source, 0.6)}>
              🐢 {t("learn.slower")}
            </button>
          </div>
        ) : (
          <div className="type-question" dir={dirOf(target)}>
            {card.back || card.example_translation}
            {card.part_of_speech && <span className="pos">{card.part_of_speech}</span>}
          </div>
        )}
        <input
          ref={input}
          className="type-input"
          dir={dirOf(source)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={answer}
          readOnly={!!result}
          placeholder={t("learn.yourAnswer")}
          onChange={(event) => setAnswer(event.target.value)}
        />
        {result && (
          <div className="type-result" data-result={result}>
            <span className="type-verdict">
              {result === "wrong" ? <CloseIcon /> : <CheckIcon />}
              {result === "exact"
                ? t("learn.perfect")
                : result === "close"
                  ? t("learn.almost")
                  : t("learn.notQuite")}
            </span>
            <span className="type-answer" dir={dirOf(source)}>
              <strong>{card.front}</strong>{" "}
              {card.pronunciation && <span className="ipa">{card.pronunciation}</span>}
            </span>
            {listen && (
              <span className="muted" dir={dirOf(target)}>
                {card.back}
              </span>
            )}
            {card.example && (
              <span className="muted small" dir={dirOf(source)}>
                {card.example}
              </span>
            )}
          </div>
        )}
        <div className="row center">
          {!result && (
            <button type="button" className="ghost" onClick={() => setResult("wrong")}>
              {t("learn.dontKnow")}
            </button>
          )}
          <button type="submit" className="primary">
            {result ? t("learn.next") : t("learn.check")} <kbd>Enter</kbd>
          </button>
        </div>
        <p className="muted small type-score">
          {t("learn.score", {
            correct: calendar.formatNumber(correct),
            total: calendar.formatNumber(index + (result ? 1 : 0)),
          })}
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- quiz

function QuizSession({ initial, deckFor, back, title }: SessionProps) {
  const { t, calendar } = useI18n();
  const [cards, setCards] = useState(() => shuffle(initial).slice(0, 20));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const started = useRef(Date.now());
  const card = cards[index];
  const deck = card ? deckFor(card) : undefined;
  const source = deck?.source_lang ?? "en";
  const target = deck?.target_lang ?? "fa";
  const options = useMemo(() => {
    if (!card) return [];
    const others = shuffle(initial.filter((c) => c.id !== card.id && c.back && c.back !== card.back)).slice(
      0,
      3,
    );
    return shuffle([card, ...others]);
  }, [card, initial]);

  const next = useCallback(() => {
    setIndex((i) => i + 1);
    setPicked(null);
  }, []);

  useEffect(() => {
    if (card) speak(card.front, source);
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (picked === null && n >= 1 && n <= options.length) choose(options[n - 1].id);
      else if (picked !== null && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        next();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function choose(id: number) {
    if (picked !== null || !card) return;
    setPicked(id);
    if (id === card.id) setCorrect((n) => n + 1);
  }

  if (!card) {
    return (
      <div className="page study-page">
        <Summary
          reviewed={cards.length}
          correct={correct}
          back={back}
          seconds={(Date.now() - started.current) / 1000}
          again={() => {
            setCards(shuffle(initial).slice(0, 20));
            setIndex(0);
            setCorrect(0);
            started.current = Date.now();
          }}
        />
      </div>
    );
  }

  return (
    <div className="page study-page">
      <SessionHeader title={title} done={index} total={cards.length} back={back} icon={<QuizIcon />} />
      <div className="quiz-card">
        <p className="muted small">{t("learn.quizPrompt")}</p>
        <div className="quiz-word" dir={dirOf(source)}>
          {card.front}
          <button
            type="button"
            className="icon-button"
            onClick={() => speak(card.front, source)}
            aria-label={t("learn.listen")}
          >
            <SpeakerIcon />
          </button>
        </div>
        {card.pronunciation && <span className="flashcard-ipa">{card.pronunciation}</span>}
        <div className="quiz-options">
          {options.map((option, i) => {
            const state =
              picked === null
                ? "idle"
                : option.id === card.id
                  ? "right"
                  : option.id === picked
                    ? "wrong"
                    : "dim";
            return (
              <button
                key={option.id}
                type="button"
                className="quiz-option"
                data-state={state}
                onClick={() => choose(option.id)}
                dir={dirOf(target)}
              >
                <kbd>{calendar.formatNumber(i + 1)}</kbd>
                <span>{option.back}</span>
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div className="quiz-after">
            {card.example && (
              <p className="small" dir={dirOf(source)}>
                {card.example}
                {card.example_translation && (
                  <span className="muted" dir={dirOf(target)}>
                    {" "}
                    — {card.example_translation}
                  </span>
                )}
              </p>
            )}
            <button type="button" className="primary" onClick={next}>
              {t("learn.next")} <kbd>Enter</kbd>
            </button>
          </div>
        )}
        <p className="muted small type-score">
          {t("learn.score", {
            correct: calendar.formatNumber(correct),
            total: calendar.formatNumber(index + (picked !== null ? 1 : 0)),
          })}
        </p>
      </div>
    </div>
  );
}
