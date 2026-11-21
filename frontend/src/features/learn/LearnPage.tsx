/**
 * Language learning home: today's numbers (due cards, streak, reviews, mastered), an
 * activity heatmap, the flashcard decks and the songs. New decks can be filled by the AI.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { filesApi } from "../../api/endpoints";
import { learnApi } from "../../api/v5";
import { useToast } from "../../components/Feedback";
import {
  CheckCircleIcon,
  FlameIcon,
  GraduationIcon,
  LyricsIcon,
  MusicIcon,
  PlayFilledIcon,
  PlusIcon,
  SparkleIcon,
  TargetIcon,
  TrashIcon,
  UploadIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { ColorPicker, EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { categoryStyle } from "../../lib/palette";
import type { ColorName } from "../../types";
import type { LangCode, LangDeck, LangStats } from "../../types5";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { LANGS, parseLyrics, youtubeId } from "./langs";
import { LangPair } from "./LangTag";

export const learnKeys = {
  decks: ["learn-decks"] as const,
  stats: ["learn-stats"] as const,
  songs: ["learn-songs"] as const,
};

const DECK_ICONS = ["📚", "🗣️", "✈️", "💼", "🍎", "🎬", "🎵", "🧠", "🏠", "⚽", "💬", "🌍"];

export function LearnPage() {
  const { t, plural } = useI18n();
  const { canEdit } = useWorkspace();
  const query = usePageQuery();
  const decks = useQuery({ queryKey: learnKeys.decks, queryFn: learnApi.decks });
  const stats = useQuery({ queryKey: learnKeys.stats, queryFn: learnApi.stats });
  const songs = useQuery({ queryKey: learnKeys.songs, queryFn: learnApi.songs });
  const [dialog, setDialog] = useState<"deck" | "song" | null>(null);
  const shownDecks = (decks.data ?? []).filter((d) => matchesQuery(query, d.name, d.description));
  const shownSongs = (songs.data ?? []).filter((s) => matchesQuery(query, s.title, s.artist));
  const due = stats.data?.due ?? 0;

  return (
    <div className="page learn-page">
      <PageHeader
        title={t("nav.learn")}
        subtitle={t("learn.subtitle")}
        actions={
          canEdit && (
            <>
              <button type="button" className="ghost" onClick={() => setDialog("song")}>
                <MusicIcon /> {t("learn.newSong")}
              </button>
              <button type="button" className="primary" onClick={() => setDialog("deck")}>
                <PlusIcon /> {t("learn.newDeck")}
              </button>
            </>
          )
        }
      />

      <section className="learn-hero">
        <div className="learn-hero-main">
          <span className="learn-hero-icon">
            <GraduationIcon />
          </span>
          <div>
            <h2>{due ? plural("learn.dueToday", due) : t("learn.allDone")}</h2>
            <p className="muted">{due ? t("learn.dueHint") : t("learn.allDoneHint")}</p>
          </div>
          {(due > 0 || (stats.data?.new ?? 0) > 0) && (
            <Link to="/learn/study" className="button primary learn-study-all">
              <PlayFilledIcon /> {t("learn.studyNow")}
            </Link>
          )}
        </div>
        <div className="learn-stats">
          <Stat
            icon={<FlameIcon />}
            tone="flame"
            value={stats.data?.streak ?? 0}
            label={t("learn.streak")}
            hint={t("learn.best", { n: stats.data?.best_streak ?? 0 })}
          />
          <Stat
            icon={<CheckCircleIcon />}
            tone="green"
            value={stats.data?.reviews_today ?? 0}
            label={t("learn.reviewedToday")}
            hint={
              stats.data?.reviews_today
                ? t("learn.accuracy", {
                    n: Math.round(((stats.data.correct_today ?? 0) / stats.data.reviews_today) * 100),
                  })
                : "—"
            }
          />
          <Stat
            icon={<TargetIcon />}
            tone="violet"
            value={stats.data?.mastered ?? 0}
            label={t("learn.mastered")}
            hint={t("learn.ofTotal", { n: stats.data?.total ?? 0 })}
          />
          <Stat
            icon={<SparkleIcon />}
            tone="blue"
            value={stats.data?.new ?? 0}
            label={t("learn.newCards")}
            hint={t("learn.learning", { n: stats.data?.learning ?? 0 })}
          />
        </div>
        {stats.data && <Heatmap stats={stats.data} />}
      </section>

      <div className="section-row">
        <h2 className="section-title">{t("learn.decks")}</h2>
      </div>
      {decks.isLoading ? (
        <Skeleton rows={2} height={140} />
      ) : !decks.data?.length ? (
        <EmptyState
          icon={GraduationIcon}
          title={t("learn.noDecks")}
          hint={t("learn.noDecksHint")}
          action={
            canEdit && (
              <button type="button" className="primary" onClick={() => setDialog("deck")}>
                <PlusIcon /> {t("learn.newDeck")}
              </button>
            )
          }
        />
      ) : (
        <div className="lang-deck-grid">
          {shownDecks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} />
          ))}
        </div>
      )}

      <div className="section-row">
        <h2 className="section-title">
          <LyricsIcon /> {t("learn.songs")}
        </h2>
      </div>
      {songs.isLoading ? (
        <Skeleton rows={1} height={90} />
      ) : !songs.data?.length ? (
        <div className="song-empty">
          <span className="song-empty-art" aria-hidden="true">
            🎧
          </span>
          <div>
            <strong>{t("learn.noSongs")}</strong>
            <p className="muted small">{t("learn.noSongsHint")}</p>
          </div>
          {canEdit && (
            <button type="button" onClick={() => setDialog("song")}>
              <MusicIcon /> {t("learn.newSong")}
            </button>
          )}
        </div>
      ) : (
        <div className="song-grid">
          {shownSongs.map((song) => {
            const yt = song.youtube_url ? youtubeId(song.youtube_url) : null;
            const cover = song.cover ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null);
            return (
              <Link key={song.id} to={`/learn/songs/${song.id}`} className="song-card">
                <span
                  className="song-cover"
                  style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
                >
                  {!cover && <MusicIcon />}
                  <span className="song-play">
                    <PlayFilledIcon />
                  </span>
                </span>
                <span className="song-text">
                  <strong dir="auto">{song.title}</strong>
                  <span className="muted small" dir="auto">
                    {song.artist || "—"}
                  </span>
                  <span className="song-langs small">
                    <LangPair from={song.source_lang} to={song.target_lang} /> ·{" "}
                    {plural("learn.lines", song.lines.length)}
                    {song.lines.length > 0 && song.lines.every((l) => l.time !== null) && (
                      <span className="song-synced"> · {t("learn.synced")}</span>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {dialog === "deck" && <DeckDialog onClose={() => setDialog(null)} />}
      {dialog === "song" && <SongDialog decks={decks.data ?? []} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  hint: string;
  tone: string;
}) {
  const { calendar } = useI18n();
  return (
    <div className="learn-stat" data-tone={tone}>
      <span className="learn-stat-icon">{icon}</span>
      <span className="learn-stat-text">
        <strong>{calendar.formatNumber(value)}</strong>
        <span>{label}</span>
        <span className="muted small">{hint}</span>
      </span>
    </div>
  );
}

function Heatmap({ stats }: { stats: LangStats }) {
  const { t, calendar } = useI18n();
  const weeks = useMemo(() => {
    const today = new Date();
    const days: { iso: string; count: number }[] = [];
    for (let i = 7 * 17 - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      days.push({ iso, count: stats.days[iso] ?? 0 });
    }
    const result: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [stats.days]);
  const max = Math.max(1, ...Object.values(stats.days));
  return (
    <div className="heatmap" aria-label={t("learn.activity")}>
      <span className="heatmap-title muted small">{t("learn.activity")}</span>
      <div className="heatmap-grid">
        {weeks.map((week, w) => (
          <div key={w} className="heatmap-week">
            {week.map((day) => (
              <span
                key={day.iso}
                className="heatmap-day"
                data-level={day.count ? Math.min(4, Math.ceil((day.count / max) * 4)) : 0}
                title={`${calendar.shortDate(`${day.iso}T12:00:00`)} · ${t("learn.reviewsN", { n: day.count })}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeckCard({ deck }: { deck: LangDeck }) {
  const { t, calendar } = useI18n();
  const learned = deck.total ? Math.round(((deck.total - deck.new) / deck.total) * 100) : 0;
  return (
    <div className="lang-deck" style={categoryStyle(deck.color)}>
      <Link to={`/learn/decks/${deck.id}`} className="lang-deck-main">
        <span className="lang-deck-icon">{deck.icon || "📚"}</span>
        <span className="lang-deck-text">
          <strong dir="auto">{deck.name}</strong>
          <span className="muted small">
            <LangPair from={deck.source_lang} to={deck.target_lang} names />
          </span>
        </span>
      </Link>
      <div className="lang-deck-bar" aria-label={t("learn.progress", { n: learned })}>
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
        <span data-kind="total">{t("learn.countTotal", { n: calendar.formatNumber(deck.total) })}</span>
      </div>
      <div className="lang-deck-actions">
        <Link
          to={`/learn/study/${deck.id}`}
          className={deck.due || deck.new ? "button primary small" : "button small"}
        >
          <PlayFilledIcon /> {deck.due || deck.new ? t("learn.study") : t("learn.practice")}
        </Link>
        <Link to={`/learn/decks/${deck.id}`} className="button ghost small">
          {t("learn.cards")}
        </Link>
      </div>
    </div>
  );
}

export function DeckDialog({
  deck,
  onClose,
  onDelete,
}: {
  deck?: LangDeck;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState(deck?.name ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [source, setSource] = useState<LangCode>(deck?.source_lang ?? "en");
  const [target, setTarget] = useState<LangCode>(deck?.target_lang ?? (i18n.language === "fa" ? "fa" : "en"));
  const [color, setColor] = useState<ColorName>(deck?.color ?? "violet");
  const [icon, setIcon] = useState(deck?.icon ?? "📚");
  const [perDay, setPerDay] = useState(deck?.new_per_day ?? 20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      description,
      source_lang: source,
      target_lang: target,
      color,
      icon,
      new_per_day: perDay,
    };
    try {
      const saved = deck ? await learnApi.updateDeck(deck.id, body) : await learnApi.createDeck(body);
      await client.invalidateQueries({ queryKey: learnKeys.decks });
      await client.invalidateQueries({ queryKey: ["learn-deck", saved.id] });
      onClose();
      if (!deck) navigate(`/learn/decks/${saved.id}`, { state: { isNew: true } });
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={deck ? t("learn.editDeck") : t("learn.newDeck")}
      icon={GraduationIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {onDelete && (
            <button type="button" className="ghost danger footer-start" onClick={onDelete}>
              <TrashIcon /> {t("common.delete")}
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="lang-deck-form"
            className="primary"
            disabled={busy || !name.trim() || source === target}
          >
            {deck ? t("common.save") : t("common.create")}
          </button>
        </>
      }
    >
      <form id="lang-deck-form" className="modal-split" onSubmit={submit}>
        <aside className="modal-split-aside">
          <div className="lang-deck-preview" style={categoryStyle(color)}>
            <span className="lang-deck-icon">{icon || "📚"}</span>
            <strong dir="auto">{name.trim() || t("learn.deckNamePlaceholder")}</strong>
            <span className="small">
              <LangPair from={source} to={target} />
            </span>
          </div>
          <ColorPicker label={t("categories.color")} size="sm" value={color} onChange={setColor} />
          <div className="emoji-grid">
            {DECK_ICONS.map((value) => (
              <button
                key={value}
                type="button"
                className="emoji-option"
                aria-pressed={icon === value}
                onClick={() => setIcon(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </aside>
        <div className="stack">
          <label className="field">
            <span className="field-label">{t("learn.deckName")}</span>
            <input
              type="text"
              data-autofocus
              dir="auto"
              maxLength={120}
              required
              placeholder={t("learn.deckNamePlaceholder")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t("learn.learning.lang")}</span>
              <select value={source} onChange={(event) => setSource(event.target.value as LangCode)}>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {t(l.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t("learn.native.lang")}</span>
              <select value={target} onChange={(event) => setTarget(event.target.value as LangCode)}>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {t(l.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {source === target && <p className="error-text small">{t("learn.sameLanguage")}</p>}
          <label className="field">
            <span className="field-label">{t("workspace.description")}</span>
            <textarea
              rows={2}
              dir="auto"
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("learn.newPerDay", { n: perDay })}</span>
            <input
              type="range"
              min={1}
              max={100}
              value={perDay}
              onChange={(event) => setPerDay(Number(event.target.value))}
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

export function SongDialog({ decks, onClose }: { decks: LangDeck[]; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [source, setSource] = useState<"youtube" | "file">("youtube");
  const [youtube, setYoutube] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [sourceLang, setSourceLang] = useState<LangCode>(decks[0]?.source_lang ?? "en");
  const [targetLang, setTargetLang] = useState<LangCode>(
    decks[0]?.target_lang ?? (i18n.language === "fa" ? "fa" : "en"),
  );
  const [deckId, setDeckId] = useState<number | null>(decks[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (source === "youtube" && youtube.trim() && !youtubeId(youtube)) {
      setError(t("learn.badYoutube"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let mediaUrl: string | null = null;
      if (source === "file" && file) {
        const stored = await filesApi.upload(file, setProgress);
        if (stored.kind !== "audio" && stored.kind !== "video") throw new Error(t("learn.audioOnly"));
        mediaUrl = stored.url;
      }
      const lines = parseLyrics(lyrics).map((line) => ({ ...line, translation: "" }));
      const song = await learnApi.createSong({
        title: title.trim(),
        artist: artist.trim(),
        source_lang: sourceLang,
        target_lang: targetLang,
        deck_id: deckId,
        media_url: mediaUrl,
        youtube_url: source === "youtube" && youtube.trim() ? youtube.trim() : null,
        lines,
      });
      await client.invalidateQueries({ queryKey: learnKeys.songs });
      onClose();
      navigate(`/learn/songs/${song.id}`, { state: { isNew: true } });
    } catch (err) {
      setError(err instanceof Error && !("status" in err) ? err.message : errorMessage(err, i18n));
      setBusy(false);
      setProgress(null);
      toast(t("learn.songFailed"), "error");
    }
  }

  return (
    <Modal
      title={t("learn.newSong")}
      icon={LyricsIcon}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="song-form" className="primary" disabled={busy || !title.trim()}>
            {progress !== null
              ? t("editor.uploadingPercent", { value: Math.round(progress * 100) })
              : t("common.create")}
          </button>
        </>
      }
    >
      <form id="song-form" className="modal-split" onSubmit={submit}>
        <aside className="modal-split-aside">
          <div className="song-dialog-art" aria-hidden="true">
            <span>🎤</span>
          </div>
          <p className="hint">{t("learn.songHowTo")}</p>
          <ol className="song-steps small">
            <li>{t("learn.songStep1")}</li>
            <li>{t("learn.songStep2")}</li>
            <li>{t("learn.songStep3")}</li>
            <li>{t("learn.songStep4")}</li>
          </ol>
        </aside>
        <div className="stack">
          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t("learn.songTitle")}</span>
              <input
                type="text"
                data-autofocus
                dir="auto"
                maxLength={200}
                required
                placeholder="Hello"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{t("learn.artist")}</span>
              <input
                type="text"
                dir="auto"
                maxLength={200}
                placeholder="Adele"
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
              />
            </label>
          </div>
          <div className="segmented" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={source === "youtube"}
              onClick={() => setSource("youtube")}
            >
              ▶ YouTube
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === "file"}
              onClick={() => setSource("file")}
            >
              <UploadIcon /> {t("learn.audioFile")}
            </button>
          </div>
          {source === "youtube" ? (
            <label className="field">
              <span className="field-label">{t("learn.youtubeLink")}</span>
              <input
                type="url"
                dir="ltr"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtube}
                onChange={(event) => setYoutube(event.target.value)}
              />
            </label>
          ) : (
            <label className="field">
              <span className="field-label">{t("learn.audioFile")}</span>
              <input
                type="file"
                accept="audio/*,video/mp4,video/webm"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t("learn.songLang")}</span>
              <select value={sourceLang} onChange={(event) => setSourceLang(event.target.value as LangCode)}>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {t(l.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t("learn.translateTo")}</span>
              <select value={targetLang} onChange={(event) => setTargetLang(event.target.value as LangCode)}>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {t(l.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">{t("learn.lyrics")}</span>
            <textarea
              rows={8}
              dir="auto"
              placeholder={t("learn.lyricsPlaceholder")}
              value={lyrics}
              onChange={(event) => setLyrics(event.target.value)}
            />
            <span className="hint">{t("learn.lyricsHint")}</span>
          </label>
          {decks.length > 0 && (
            <label className="field">
              <span className="field-label">{t("learn.saveWordsTo")}</span>
              <select
                value={deckId ?? ""}
                onChange={(event) => setDeckId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">{t("learn.noDeck")}</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.icon} {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
