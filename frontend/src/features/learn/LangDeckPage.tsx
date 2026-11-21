/**
 * One flashcard deck: progress, study and practice modes, the card list (filter by state,
 * search with the top bar), adding and editing cards, cards made by the AI from a topic
 * or a word list, and importing "word - meaning" lines.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { learnApi } from "../../api/v5";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  BackIcon,
  EditIcon,
  GraduationIcon,
  HeadphonesIcon,
  KeyboardTypeIcon,
  PlayFilledIcon,
  PlusIcon,
  QuizIcon,
  RefreshIcon,
  SparkleIcon,
  SpeakerIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { EmptyState, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { categoryStyle } from "../../lib/palette";
import type { CardFields, LangCard, LangDeck } from "../../types5";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { LangPair, LangTag } from "./LangTag";
import { DeckDialog, learnKeys } from "./LearnPage";
import { canSpeak, dirOf, formatDelay, speak } from "./langs";

type Filter = "all" | "new" | "learning" | "review" | "starred";

export function LangDeckPage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const { id } = useParams();
  const deckId = Number(id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, aiEnabled } = useWorkspace();
  const query = usePageQuery();
  const [params] = useSearchParams();
  const deckQuery = useQuery({ queryKey: ["learn-deck", deckId], queryFn: () => learnApi.deck(deckId) });
  const cardsQuery = useQuery({ queryKey: ["learn-cards", deckId], queryFn: () => learnApi.cards(deckId) });
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<LangCard | "new" | null>(null);
  const [dialog, setDialog] = useState<"ai" | "import" | "deck" | null>(null);
  const deck = deckQuery.data;
  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);

  // Links from the search open a card.
  useEffect(() => {
    const cardId = Number(params.get("card"));
    if (cardId && cards.length) {
      const card = cards.find((c) => c.id === cardId);
      if (card) setEditing(card);
    }
  }, [params, cards]);

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["learn-cards", deckId] });
    await client.invalidateQueries({ queryKey: ["learn-deck", deckId] });
    await client.invalidateQueries({ queryKey: learnKeys.decks });
    await client.invalidateQueries({ queryKey: learnKeys.stats });
  };

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: cards.length, new: 0, learning: 0, review: 0, starred: 0 };
    cards.forEach((c) => {
      result[c.state] += 1;
      if (c.starred) result.starred += 1;
    });
    return result;
  }, [cards]);
  const shown = cards.filter(
    (c) =>
      (filter === "all" || (filter === "starred" ? c.starred : c.state === filter)) &&
      matchesQuery(query, c.front, c.back, c.example, c.example_translation, c.tags.join(" ")),
  );

  if (deckQuery.isLoading) return <Skeleton rows={4} height={90} />;
  if (!deck) {
    return (
      <EmptyState
        icon={GraduationIcon}
        title={deckQuery.error ? errorMessage(deckQuery.error, i18n) : t("learn.deckNotFound")}
        action={
          <Link to="/learn" className="button">
            {t("common.back")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="page lang-deck-page" style={categoryStyle(deck.color)}>
      <header className="lang-deck-hero">
        <button
          type="button"
          className="icon-button"
          onClick={() => navigate("/learn")}
          aria-label={t("common.back")}
        >
          <BackIcon />
        </button>
        <span className="lang-deck-icon big">{deck.icon || "📚"}</span>
        <div className="lang-deck-hero-text">
          <h1 dir="auto">{deck.name}</h1>
          <p className="muted">
            <LangPair from={deck.source_lang} to={deck.target_lang} names />
            {deck.description && (
              <>
                {" "}
                · <span dir="auto">{deck.description}</span>
              </>
            )}
          </p>
          <div className="lang-deck-bar big">
            <span
              className="seg-mastered"
              style={{ width: `${deck.total ? (deck.mastered / deck.total) * 100 : 0}%` }}
            />
            <span
              className="seg-learned"
              style={{
                width: `${deck.total ? ((deck.total - deck.new - deck.mastered) / deck.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="lang-deck-counts small">
            <span data-kind="due">{t("learn.countDue", { n: calendar.formatNumber(deck.due) })}</span>
            <span data-kind="new">{t("learn.countNew", { n: calendar.formatNumber(deck.new) })}</span>
            <span data-kind="mastered">
              {t("learn.countMastered", { n: calendar.formatNumber(deck.mastered) })}
            </span>
            <span data-kind="total">{t("learn.countTotal", { n: calendar.formatNumber(deck.total) })}</span>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            className="icon-button"
            onClick={() => setDialog("deck")}
            title={t("learn.editDeck")}
            aria-label={t("learn.editDeck")}
          >
            <EditIcon />
          </button>
        )}
      </header>

      <div className="study-modes">
        <Link
          to={`/learn/study/${deck.id}`}
          className="study-mode primary-mode"
          data-disabled={!cards.length}
        >
          <PlayFilledIcon />
          <strong>{t("learn.mode.flashcards")}</strong>
          <span className="small">
            {deck.due + Math.min(deck.new, deck.new_per_day)
              ? t("learn.mode.flashcardsDue", { n: deck.due + Math.min(deck.new, deck.new_per_day) })
              : t("learn.mode.flashcardsHint")}
          </span>
        </Link>
        <Link to={`/learn/study/${deck.id}?mode=type`} className="study-mode" data-disabled={!cards.length}>
          <KeyboardTypeIcon />
          <strong>{t("learn.mode.type")}</strong>
          <span className="small muted">{t("learn.mode.typeHint")}</span>
        </Link>
        <Link
          to={`/learn/study/${deck.id}?mode=quiz`}
          className="study-mode"
          data-disabled={cards.length < 4}
        >
          <QuizIcon />
          <strong>{t("learn.mode.quiz")}</strong>
          <span className="small muted">{t("learn.mode.quizHint")}</span>
        </Link>
        <Link
          to={`/learn/study/${deck.id}?mode=listen`}
          className="study-mode"
          data-disabled={!cards.length || !canSpeak()}
        >
          <HeadphonesIcon />
          <strong>{t("learn.mode.listen")}</strong>
          <span className="small muted">{t("learn.mode.listenHint")}</span>
        </Link>
      </div>

      <div className="lang-cards-toolbar">
        <div className="segmented scroll" role="tablist">
          {(["all", "new", "learning", "review", "starred"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
            >
              {t(`learn.filter.${f}`)} <span className="count">{calendar.formatNumber(counts[f])}</span>
            </button>
          ))}
        </div>
        {canEdit && (
          <span className="row wrap">
            <button type="button" className="ghost" onClick={() => setDialog("import")}>
              <UploadIcon /> {t("learn.import")}
            </button>
            {aiEnabled && (
              <button type="button" className="ghost ai-ghost" onClick={() => setDialog("ai")}>
                <SparkleIcon /> {t("learn.aiCards")}
              </button>
            )}
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              <PlusIcon /> {t("learn.addCard")}
            </button>
          </span>
        )}
      </div>

      {cardsQuery.isLoading ? (
        <Skeleton rows={4} height={64} />
      ) : !cards.length ? (
        <EmptyState
          icon={GraduationIcon}
          title={t("learn.noCards")}
          hint={t("learn.noCardsHint")}
          action={
            canEdit && (
              <span className="row wrap center">
                {aiEnabled && (
                  <button type="button" className="primary" onClick={() => setDialog("ai")}>
                    <SparkleIcon /> {t("learn.aiCards")}
                  </button>
                )}
                <button type="button" onClick={() => setEditing("new")}>
                  <PlusIcon /> {t("learn.addCard")}
                </button>
              </span>
            )
          }
        />
      ) : !shown.length ? (
        <EmptyState icon={GraduationIcon} title={t("search.nothing")} />
      ) : (
        <div className="lang-card-list">
          {shown.map((card) => (
            <div key={card.id} className="lang-card-row" data-state={card.state}>
              <button
                type="button"
                className="icon-button small"
                onClick={() => speak(card.front, deck.source_lang)}
                title={t("learn.listen")}
                aria-label={t("learn.listen")}
              >
                <SpeakerIcon />
              </button>
              <button type="button" className="lang-card-main" onClick={() => setEditing(card)}>
                <span className="lang-card-front" dir={dirOf(deck.source_lang)}>
                  <strong>{card.front}</strong>
                  {card.pronunciation && <span className="muted small ipa">{card.pronunciation}</span>}
                  {card.part_of_speech && <span className="pos small">{card.part_of_speech}</span>}
                </span>
                <span className="lang-card-back" dir={dirOf(deck.target_lang)}>
                  {card.back}
                </span>
                {card.example && (
                  <span className="lang-card-example muted small" dir={dirOf(deck.source_lang)}>
                    {card.example}
                  </span>
                )}
              </button>
              <span className="lang-card-state small" data-state={card.state}>
                {card.state === "new"
                  ? t("learn.state.new")
                  : card.due_at && Date.parse(card.due_at) <= Date.now()
                    ? t("learn.state.due")
                    : card.state === "learning"
                      ? t("learn.state.learning")
                      : formatDelay(card.interval_days * 86400, t, calendar.formatNumber)}
              </span>
              {canEdit && (
                <button
                  type="button"
                  className={card.starred ? "icon-button small favorite-button" : "icon-button small"}
                  aria-pressed={card.starred}
                  onClick={async () => {
                    await learnApi.updateCard(card.id, { starred: !card.starred }).catch(() => undefined);
                    await refresh();
                  }}
                  title={t("learn.hard")}
                  aria-label={t("learn.hard")}
                >
                  <StarIcon filled={card.starred} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CardDialog
          deck={deck}
          card={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
          onDelete={
            editing !== "new"
              ? async () => {
                  const ok = await confirm({
                    title: t("learn.deleteCard"),
                    confirmLabel: t("common.delete"),
                    danger: true,
                  });
                  if (!ok) return;
                  await learnApi
                    .removeCard(editing.id)
                    .catch((err) => toast(errorMessage(err, i18n), "error"));
                  setEditing(null);
                  await refresh();
                }
              : undefined
          }
        />
      )}
      {dialog === "ai" && (
        <AiCardsDialog deck={deck} existing={cards} onClose={() => setDialog(null)} onAdded={refresh} />
      )}
      {dialog === "import" && <ImportDialog deck={deck} onClose={() => setDialog(null)} onAdded={refresh} />}
      {dialog === "deck" && (
        <DeckDialog
          deck={deck}
          onClose={() => setDialog(null)}
          onDelete={async () => {
            const ok = await confirm({
              title: t("learn.deleteDeck", { name: deck.name }),
              message: t("learn.deleteDeckHint"),
              confirmLabel: t("common.delete"),
              danger: true,
            });
            if (!ok) return;
            await learnApi.removeDeck(deck.id).catch((err) => toast(errorMessage(err, i18n), "error"));
            await client.invalidateQueries({ queryKey: learnKeys.decks });
            navigate("/learn");
          }}
        />
      )}
    </div>
  );
}

const EMPTY: CardFields = {
  front: "",
  back: "",
  pronunciation: "",
  part_of_speech: "",
  example: "",
  example_translation: "",
  notes: "",
  image: null,
  tags: [],
};

function CardDialog({
  deck,
  card,
  onClose,
  onSaved,
  onDelete,
}: {
  deck: LangDeck;
  card: LangCard | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete?: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const { aiEnabled } = useWorkspace();
  const [draft, setDraft] = useState<CardFields>(card ? { ...EMPTY, ...card } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [another, setAnother] = useState(false);

  const set = (changes: Partial<CardFields>) => setDraft((d) => ({ ...d, ...changes }));

  async function fill() {
    if (!draft.front.trim()) return;
    setAiBusy(true);
    setError(null);
    try {
      const result = await learnApi.explain({
        word: draft.front.trim(),
        context: draft.example,
        source_lang: deck.source_lang,
        target_lang: deck.target_lang,
      });
      setDraft((d) => ({
        ...d,
        back: d.back || result.card.back,
        pronunciation: d.pronunciation || result.card.pronunciation,
        part_of_speech: d.part_of_speech || result.card.part_of_speech,
        example: d.example || result.card.example,
        example_translation: d.example_translation || result.card.example_translation,
        notes: d.notes || result.explanation,
      }));
      setExplanation(result.explanation);
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setAiBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.front.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (card) await learnApi.updateCard(card.id, draft);
      else await learnApi.addCard(deck.id, draft);
      await onSaved();
      if (another && !card) {
        setDraft(EMPTY);
        setExplanation(null);
        setBusy(false);
      } else onClose();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={card ? t("learn.editCard") : t("learn.addCard")}
      icon={GraduationIcon}
      onClose={onClose}
      size="xl"
      footer={
        <>
          {onDelete && (
            <button type="button" className="ghost danger footer-start" onClick={onDelete}>
              <TrashIcon /> {t("common.delete")}
            </button>
          )}
          {card && (
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                await learnApi.resetCard(card.id);
                await onSaved();
                onClose();
              }}
            >
              <RefreshIcon /> {t("learn.resetCard")}
            </button>
          )}
          {!card && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={another}
                onChange={(event) => setAnother(event.target.checked)}
              />
              {t("learn.addAnother")}
            </label>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="card-form" className="primary" disabled={busy || !draft.front.trim()}>
            {card ? t("common.save") : t("common.add")}
          </button>
        </>
      }
    >
      <form id="card-form" className="card-editor" onSubmit={submit}>
        <div className="card-editor-preview">
          <div className="flash-mini">
            <div className="flash-mini-face" dir={dirOf(deck.source_lang)}>
              <strong>{draft.front || t("learn.front")}</strong>
              {draft.pronunciation && <span className="ipa">{draft.pronunciation}</span>}
            </div>
            <div className="flash-mini-face back" dir={dirOf(deck.target_lang)}>
              <strong>{draft.back || t("learn.back")}</strong>
              {draft.example && <span className="small">{draft.example}</span>}
            </div>
          </div>
          {explanation && (
            <div className="ai-explain small" dir="auto">
              <SparkleIcon /> {explanation}
            </div>
          )}
        </div>
        <div className="stack">
          <label className="field">
            <span className="field-label">
              <LangTag code={deck.source_lang} /> {t("learn.front")}
            </span>
            <span className="row">
              <input
                type="text"
                data-autofocus
                dir={dirOf(deck.source_lang)}
                maxLength={500}
                required
                value={draft.front}
                onChange={(event) => set({ front: event.target.value })}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => speak(draft.front, deck.source_lang)}
                title={t("learn.listen")}
              >
                <SpeakerIcon />
              </button>
              {aiEnabled && (
                <button
                  type="button"
                  className="ghost ai-ghost"
                  onClick={() => void fill()}
                  disabled={aiBusy || !draft.front.trim()}
                >
                  <SparkleIcon /> {aiBusy ? t("learn.aiThinking") : t("learn.aiFill")}
                </button>
              )}
            </span>
          </label>
          <label className="field">
            <span className="field-label">
              <LangTag code={deck.target_lang} /> {t("learn.back")}
            </span>
            <input
              type="text"
              dir={dirOf(deck.target_lang)}
              maxLength={500}
              value={draft.back}
              onChange={(event) => set({ back: event.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t("learn.pronunciation")}</span>
              <input
                type="text"
                dir="ltr"
                maxLength={200}
                placeholder="/həˈloʊ/"
                value={draft.pronunciation}
                onChange={(event) => set({ pronunciation: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">{t("learn.partOfSpeech")}</span>
              <input
                type="text"
                dir="auto"
                maxLength={40}
                value={draft.part_of_speech}
                onChange={(event) => set({ part_of_speech: event.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">{t("learn.example")}</span>
            <input
              type="text"
              dir={dirOf(deck.source_lang)}
              maxLength={1000}
              value={draft.example}
              onChange={(event) => set({ example: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("learn.exampleTranslation")}</span>
            <input
              type="text"
              dir={dirOf(deck.target_lang)}
              maxLength={1000}
              value={draft.example_translation}
              onChange={(event) => set({ example_translation: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("learn.notes")}</span>
            <textarea
              rows={2}
              dir="auto"
              maxLength={5000}
              value={draft.notes}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("learn.tags")}</span>
            <input
              type="text"
              dir="auto"
              placeholder={t("learn.tagsPlaceholder")}
              value={draft.tags.join(", ")}
              onChange={(event) =>
                set({
                  tags: event.target.value
                    .split(/[,،]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 20),
                })
              }
            />
          </label>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}

function AiCardsDialog({
  deck,
  existing,
  onClose,
  onAdded,
}: {
  deck: LangDeck;
  existing: LangCard[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const [mode, setMode] = useState<"topic" | "words">("topic");
  const [topic, setTopic] = useState("");
  const [words, setWords] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<CardFields[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const known = useMemo(() => new Set(existing.map((c) => c.front.trim().toLowerCase())), [existing]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await learnApi.aiCards({
        topic: mode === "topic" ? topic : "",
        words: mode === "words" ? words : "",
        count,
        level,
        source_lang: deck.source_lang,
        target_lang: deck.target_lang,
      });
      setSuggestions(result.cards);
      setPicked(
        new Set(
          result.cards
            .map((c, i) => (known.has(c.front.trim().toLowerCase()) ? -1 : i))
            .filter((i) => i >= 0),
        ),
      );
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!suggestions) return;
    const cards = suggestions.filter((_, i) => picked.has(i));
    if (!cards.length) return;
    setBusy(true);
    try {
      await learnApi.addCards(deck.id, cards);
      await onAdded();
      toast(t("learn.cardsAdded", { n: cards.length }), "success");
      onClose();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("learn.aiCards")}
      icon={SparkleIcon}
      onClose={onClose}
      size="xl"
      footer={
        suggestions ? (
          <>
            <button type="button" className="ghost" onClick={() => setSuggestions(null)}>
              {t("learn.tryAgain")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !picked.size}
              onClick={() => void add()}
            >
              <PlusIcon /> {t("learn.addN", { n: picked.size })}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              form="ai-cards-form"
              className="primary"
              disabled={busy || (mode === "topic" ? !topic.trim() : !words.trim())}
            >
              <SparkleIcon /> {busy ? t("learn.aiThinking") : t("learn.aiMake")}
            </button>
          </>
        )
      }
    >
      {!suggestions ? (
        <form id="ai-cards-form" className="stack" onSubmit={generate}>
          <div className="segmented" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "topic"}
              onClick={() => setMode("topic")}
            >
              {t("learn.aiByTopic")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "words"}
              onClick={() => setMode("words")}
            >
              {t("learn.aiByWords")}
            </button>
          </div>
          {mode === "topic" ? (
            <>
              <label className="field">
                <span className="field-label">{t("learn.aiTopic")}</span>
                <input
                  type="text"
                  dir="auto"
                  data-autofocus
                  maxLength={500}
                  placeholder={t("learn.aiTopicPlaceholder")}
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                />
              </label>
              <div className="chips">
                {[
                  "learn.topic.travel",
                  "learn.topic.food",
                  "learn.topic.work",
                  "learn.topic.feelings",
                  "learn.topic.phrasal",
                  "learn.topic.idioms",
                ].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="chip"
                    onClick={() => setTopic(t(key as TranslationKey))}
                  >
                    {t(key as TranslationKey)}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">{t("learn.level")}</span>
                  <select value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>
                    <option value="beginner">{t("learn.level.beginner")}</option>
                    <option value="intermediate">{t("learn.level.intermediate")}</option>
                    <option value="advanced">{t("learn.level.advanced")}</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">{t("learn.howMany", { n: count })}</span>
                  <input
                    type="range"
                    min={3}
                    max={30}
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value))}
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="field">
              <span className="field-label">{t("learn.aiWords")}</span>
              <textarea
                rows={8}
                dir={dirOf(deck.source_lang)}
                data-autofocus
                placeholder={t("learn.aiWordsPlaceholder")}
                value={words}
                onChange={(event) => setWords(event.target.value)}
              />
            </label>
          )}
          {busy && <p className="muted small">{t("learn.aiWait")}</p>}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="ai-cards">
          <p className="muted small">{t("learn.aiPick")}</p>
          {suggestions.map((card, index) => {
            const duplicate = known.has(card.front.trim().toLowerCase());
            return (
              <label key={index} className="ai-card" data-picked={picked.has(index)}>
                <input
                  type="checkbox"
                  checked={picked.has(index)}
                  onChange={() =>
                    setPicked((set) => {
                      const next = new Set(set);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                />
                <span className="ai-card-text">
                  <span dir={dirOf(deck.source_lang)}>
                    <strong>{card.front}</strong>{" "}
                    {card.pronunciation && <span className="ipa muted small">{card.pronunciation}</span>}{" "}
                    {card.part_of_speech && <span className="pos small">{card.part_of_speech}</span>}
                  </span>
                  <span dir={dirOf(deck.target_lang)}>{card.back}</span>
                  {card.example && (
                    <span className="muted small" dir={dirOf(deck.source_lang)}>
                      {card.example}
                    </span>
                  )}
                  {card.example_translation && (
                    <span className="muted small" dir={dirOf(deck.target_lang)}>
                      {card.example_translation}
                    </span>
                  )}
                </span>
                {duplicate && <span className="badge">{t("learn.alreadyInDeck")}</span>}
              </label>
            );
          })}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function ImportDialog({
  deck,
  onClose,
  onAdded,
}: {
  deck: LangDeck;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/\t|\s[-–—=:]\s|;|,(?=\s)/);
          return {
            front: (parts[0] ?? "").trim(),
            back: parts.slice(1, 2).join("").trim(),
            example: parts.slice(2).join(" ").trim(),
          };
        })
        .filter((c) => c.front),
    [text],
  );

  async function submit() {
    setBusy(true);
    try {
      await learnApi.addCards(deck.id, parsed);
      await onAdded();
      toast(t("learn.cardsAdded", { n: parsed.length }), "success");
      onClose();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("learn.import")}
      icon={UploadIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !parsed.length}
            onClick={() => void submit()}
          >
            {t("learn.addN", { n: parsed.length })}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">{t("learn.importHint")}</p>
        <textarea
          rows={10}
          dir="auto"
          data-autofocus
          placeholder={"apple - سیب\nto run - دویدن - I run every morning."}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <label className="file-pick small">
          <UploadIcon /> {t("learn.importFile")}
          <input
            type="file"
            accept=".txt,.csv,.tsv,text/plain,text/csv"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
        </label>
        {parsed.length > 0 && (
          <div className="import-preview">
            {parsed.slice(0, 8).map((c, i) => (
              <span key={i} className="small">
                <strong dir="auto">{c.front}</strong> → <span dir="auto">{c.back || "—"}</span>
              </span>
            ))}
            {parsed.length > 8 && <span className="muted small">+{parsed.length - 8}</span>}
          </div>
        )}
      </div>
    </Modal>
  );
}
