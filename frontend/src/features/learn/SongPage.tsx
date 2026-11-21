/**
 * Learning with a song: the lyrics follow the music line by line, each with its
 * translation. Lines are timed by importing LRC lyrics or with "tap to sync" (press Space
 * at the start of each line while the song plays). The AI translates all lines; clicking a
 * word explains it and can save it as a flashcard. Practice tools: repeat a line, slower
 * speed, hide the original or the translation.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { learnApi } from "../../api/v5";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  BackIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  LyricsIcon,
  MusicIcon,
  PauseFilledIcon,
  PlayFilledIcon,
  PlusIcon,
  RefreshIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SparkleIcon,
  SpeakerIcon,
  TimerIcon,
  TranslateIcon,
  TrashIcon,
  UploadIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { EmptyState, Skeleton } from "../../components/ui";
import { useAutosave } from "../../hooks/useAutosave";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { CardFields, LangDeck, Song, SongChanges, SongLine } from "../../types5";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { LangPair, LangTag } from "./LangTag";
import { learnKeys } from "./LearnPage";
import { dirOf, formatTime, lang, parseLyrics, speak, youtubeId } from "./langs";
import { useSongPlayer, type SongPlayer } from "./useSongPlayer";

type Display = "both" | "original" | "translation";

export function SongPage() {
  const { id } = useParams();
  const i18n = useI18n();
  const { t } = i18n;
  const { data, isLoading, error } = useQuery({
    queryKey: ["learn-song", Number(id)],
    queryFn: () => learnApi.song(Number(id)),
    staleTime: Infinity,
  });
  if (isLoading) return <Skeleton rows={3} height={140} />;
  if (!data) {
    return (
      <EmptyState
        icon={LyricsIcon}
        title={error ? errorMessage(error, i18n) : t("learn.songNotFound")}
        action={
          <Link to="/learn" className="button">
            {t("common.back")}
          </Link>
        }
      />
    );
  }
  return <SongView key={data.id} initial={data} />;
}

/** Index of the line being sung at `time` (the last line whose time has passed). */
function activeLine(lines: SongLine[], time: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].time;
    if (at !== null && at <= time + 0.05) index = i;
  }
  return index;
}

function SongView({ initial }: { initial: Song }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { canEdit, aiEnabled } = useWorkspace();
  const [song, setSong] = useState(initial);
  const { player, view } = useSongPlayer(song);
  const [display, setDisplay] = useLocalStorage<Display>("song.display", "both");
  const [size, setSize] = useLocalStorage("song.size", 1);
  const [editing, setEditing] = useState(!initial.lines.length && canEdit);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [loopLine, setLoopLine] = useState<number | null>(null);
  const [translating, setTranslating] = useState(false);
  const [word, setWord] = useState<{ text: string; line: string } | null>(null);
  const decks = useQuery({ queryKey: learnKeys.decks, queryFn: learnApi.decks });
  const list = useRef<HTMLDivElement>(null);
  const source = song.source_lang;
  const target = song.target_lang;

  const { state: saveState, schedule } = useAutosave<SongChanges>(async (changes) => {
    const saved = await learnApi.updateSong(song.id, changes);
    client.setQueryData(["learn-song", song.id], saved);
    void client.invalidateQueries({ queryKey: learnKeys.songs });
  });
  const change = useCallback(
    (changes: SongChanges) => {
      setSong((s) => ({ ...s, ...changes }));
      schedule(changes);
    },
    [schedule],
  );
  const setLines = useCallback(
    (update: (lines: SongLine[]) => SongLine[]) =>
      setSong((s) => {
        const lines = update(s.lines);
        schedule({ lines });
        return { ...s, lines };
      }),
    [schedule],
  );

  const timed = song.lines.some((l) => l.time !== null);
  const current = activeLine(song.lines, player.time);

  // Keep the current line in the middle of the lyrics.
  useEffect(() => {
    if (current < 0 || editing || syncing !== null) return;
    list.current
      ?.querySelector(`[data-line="${current}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current, editing, syncing]);

  // Repeat one line: jump back to its start when the next line begins.
  useEffect(() => {
    if (loopLine === null) return;
    const start = song.lines[loopLine]?.time;
    const end =
      song.lines.slice(loopLine + 1).find((l) => l.time !== null)?.time ?? (player.duration || Infinity);
    if (start == null) return;
    if (player.time >= end - 0.05 || player.time < start - 1) player.seek(start);
  }, [player.time, loopLine, song.lines, player]);

  // Keyboard: Space plays/pauses (or stamps a line while syncing), arrows jump lines.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === " ") {
        event.preventDefault();
        if (syncing !== null) stamp();
        else player.toggle();
      } else if (event.key === "Backspace" && syncing !== null) {
        event.preventDefault();
        setSyncing((n) => Math.max(0, (n ?? 0) - 1));
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const next = song.lines
          .slice(0)
          .findIndex((_, i) => i === current + (event.key === "ArrowDown" ? 1 : -1));
        const at = song.lines[next]?.time;
        if (at != null) {
          event.preventDefault();
          player.seek(at);
        }
      } else if (event.key === "Escape" && syncing !== null) setSyncing(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function stamp() {
    if (syncing === null) return;
    // People press a little late; start the line a fraction earlier.
    const at = Math.max(0, Math.round((player.now() - 0.15) * 100) / 100);
    setLines((lines) => lines.map((l, i) => (i === syncing ? { ...l, time: at } : l)));
    if (syncing + 1 >= song.lines.length) {
      setSyncing(null);
      toast(t("learn.syncDone"), "success");
    } else setSyncing(syncing + 1);
  }

  async function translateAll() {
    const lines = song.lines.map((l) => l.text);
    if (!lines.some((l) => l.trim())) return;
    setTranslating(true);
    try {
      const result = await learnApi.translateLines({
        lines,
        source_lang: source,
        target_lang: target,
        title: `${song.title} — ${song.artist}`,
      });
      setLines((current) =>
        current.map((l, i) => ({ ...l, translation: result.translations[i] || l.translation })),
      );
      toast(t("learn.translated"), "success");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setTranslating(false);
    }
  }

  const yt = song.youtube_url ? youtubeId(song.youtube_url) : null;
  const cover = song.cover ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null);
  const status: Record<string, string> = {
    saved: t("notes.saved"),
    pending: t("notes.unsaved"),
    saving: t("notes.saving"),
    error: t("notes.saveFailed"),
  };

  return (
    <div className="song-page" style={{ "--lyrics-scale": size } as React.CSSProperties}>
      <header className="song-head">
        <button
          type="button"
          className="icon-button"
          onClick={() => navigate("/learn")}
          aria-label={t("common.back")}
        >
          <BackIcon />
        </button>
        <div className="song-head-text">
          <h1 dir="auto">{song.title}</h1>
          <span className="muted small" dir="auto">
            {song.artist} · <LangPair from={source} to={target} />
          </span>
        </div>
        {canEdit && (
          <span className="save-state" data-state={saveState} role="status">
            <span className="save-dot" aria-hidden="true" />
            <span className="hide-on-phone">{status[saveState]}</span>
          </span>
        )}
        <span className="song-head-actions">
          {canEdit && aiEnabled && song.lines.length > 0 && (
            <button
              type="button"
              className="ghost ai-ghost"
              onClick={() => void translateAll()}
              disabled={translating}
            >
              <TranslateIcon />{" "}
              <span className="hide-on-phone">
                {translating ? t("learn.translating") : t("learn.translateAll")}
              </span>
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className={editing ? "primary" : "ghost"}
              onClick={() => setEditing(!editing)}
              aria-pressed={editing}
            >
              {editing ? <CheckIcon /> : <EditIcon />}{" "}
              <span className="hide-on-phone">
                {editing ? t("learn.doneEditing") : t("learn.editLyrics")}
              </span>
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="icon-button danger"
              aria-label={t("common.delete")}
              title={t("common.delete")}
              onClick={async () => {
                const ok = await confirm({
                  title: t("learn.deleteSong", { title: song.title }),
                  confirmLabel: t("common.delete"),
                  danger: true,
                });
                if (!ok) return;
                await learnApi.removeSong(song.id).catch(() => undefined);
                await client.invalidateQueries({ queryKey: learnKeys.songs });
                navigate("/learn");
              }}
            >
              <TrashIcon />
            </button>
          )}
        </span>
      </header>

      <div className="song-layout">
        <section className="song-player-card">
          <div
            className="song-media"
            data-kind={yt && !song.media_url ? "youtube" : "file"}
            style={cover && !yt ? { backgroundImage: `url("${cover}")` } : undefined}
          >
            {view}
            {!view && (
              <div className="song-no-media">
                <MusicIcon />
                <span className="small">{t("learn.noMedia")}</span>
              </div>
            )}
            {song.media_url && (
              <div className="song-disc" data-playing={player.playing} aria-hidden="true">
                <span>{cover ? <img src={cover} alt="" /> : "♪"}</span>
              </div>
            )}
            {player.failed && <p className="error-text small">{t("learn.mediaFailed")}</p>}
          </div>
          <Controls player={player} />
          {!editing && (
            <div className="song-toggles">
              <div className="segmented compact" role="group" aria-label={t("learn.display")}>
                {(["both", "original", "translation"] as const).map((d) => (
                  <button key={d} type="button" aria-pressed={display === d} onClick={() => setDisplay(d)}>
                    {t(`learn.display.${d}`)}
                  </button>
                ))}
              </div>
              <div className="segmented compact" role="group" aria-label={t("learn.textSize")}>
                <button
                  type="button"
                  onClick={() => setSize(Math.max(0.8, Math.round((size - 0.1) * 10) / 10))}
                  aria-label={t("learn.smaller")}
                >
                  A−
                </button>
                <button
                  type="button"
                  onClick={() => setSize(Math.min(1.6, Math.round((size + 0.1) * 10) / 10))}
                  aria-label={t("learn.bigger")}
                >
                  A+
                </button>
              </div>
              <p className="hint song-word-hint">{t("learn.wordHint")}</p>
              {loopLine !== null && (
                <button type="button" className="chip" aria-pressed onClick={() => setLoopLine(null)}>
                  <RefreshIcon /> {t("learn.repeating")} <CloseIcon />
                </button>
              )}
            </div>
          )}
          {!timed && song.lines.length > 0 && !editing && (
            <div className="song-sync-tip">
              <TimerIcon />
              <span className="small">{t("learn.notSyncedHint")}</span>
              {canEdit && (
                <button type="button" className="small" onClick={() => setEditing(true)}>
                  {t("learn.syncNow")}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="song-lyrics" ref={list}>
          {editing ? (
            <LyricsEditor
              song={song}
              player={player}
              syncing={syncing}
              onSync={(from) => {
                setSyncing(from);
                player.seek(from > 0 ? Math.max(0, (song.lines[from - 1]?.time ?? 0) - 0.5) : 0);
                player.play();
              }}
              onStopSync={() => setSyncing(null)}
              onLines={setLines}
              onChange={change}
              onTranslate={aiEnabled ? () => void translateAll() : undefined}
              translating={translating}
            />
          ) : !song.lines.length ? (
            <EmptyState
              icon={LyricsIcon}
              title={t("learn.noLyrics")}
              hint={canEdit ? t("learn.noLyricsHint") : undefined}
            />
          ) : (
            <ol className="lyrics" data-display={display}>
              {song.lines.map((line, index) => (
                <li
                  key={index}
                  data-line={index}
                  data-state={index === current ? "current" : index < current ? "past" : "future"}
                  data-loop={loopLine === index}
                  onClick={() => line.time !== null && player.seek(line.time)}
                >
                  {display !== "translation" && (
                    <p className="lyric-text" dir={dirOf(source)}>
                      {line.text.split(/(\s+)/).map((part, i) =>
                        /\s+/.test(part) || !part ? (
                          part
                        ) : (
                          <span
                            key={i}
                            className="lyric-word"
                            title={t("learn.wordHint")}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              window.getSelection()?.removeAllRanges();
                              player.pause();
                              setWord({
                                text: part.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""),
                                line: line.text,
                              });
                            }}
                          >
                            {part}
                          </span>
                        ),
                      )}
                    </p>
                  )}
                  {display !== "original" && line.translation && (
                    <p className="lyric-translation" dir={dirOf(target)}>
                      {line.translation}
                    </p>
                  )}
                  <span className="lyric-tools">
                    <button
                      type="button"
                      className="icon-button small"
                      title={t("learn.repeatLine")}
                      aria-label={t("learn.repeatLine")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setLoopLine(loopLine === index ? null : index);
                        if (line.time !== null) player.seek(line.time);
                        player.play();
                      }}
                      disabled={line.time === null}
                    >
                      <RefreshIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button small"
                      title={t("learn.listen")}
                      aria-label={t("learn.listen")}
                      onClick={(event) => {
                        event.stopPropagation();
                        speak(line.text, source, 0.85);
                      }}
                    >
                      <SpeakerIcon />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {syncing !== null && song.lines[syncing] && (
        <div className="sync-bar" role="region" aria-label={t("learn.tapSync")}>
          <div className="sync-lines">
            <span className="muted small">
              {t("learn.syncLine", { n: syncing + 1, total: song.lines.length })}
            </span>
            <strong dir={dirOf(source)}>{song.lines[syncing].text || "♪"}</strong>
            {song.lines[syncing + 1] && (
              <span className="muted small" dir={dirOf(source)}>
                {t("learn.nextLine")}: {song.lines[syncing + 1].text}
              </span>
            )}
          </div>
          <button type="button" className="sync-tap" onClick={stamp}>
            <TimerIcon /> {t("learn.tap")} <kbd>Space</kbd>
          </button>
          <button type="button" className="ghost small" onClick={() => setSyncing(Math.max(0, syncing - 1))}>
            {t("learn.syncBack")}
          </button>
          <button type="button" className="ghost small" onClick={() => setSyncing(null)}>
            {t("learn.syncStop")}
          </button>
        </div>
      )}

      {word && (
        <WordDialog
          word={word.text}
          line={word.line}
          song={song}
          decks={decks.data ?? []}
          canEdit={canEdit}
          aiEnabled={aiEnabled}
          onClose={() => setWord(null)}
        />
      )}
    </div>
  );
}

function Controls({ player }: { player: SongPlayer }) {
  const { t, calendar } = useI18n();
  const rates = [0.6, 0.75, 1, 1.25];
  return (
    <div className="song-controls">
      <input
        type="range"
        className="song-seek"
        min={0}
        max={Math.max(1, player.duration)}
        step={0.1}
        value={Math.min(player.time, player.duration || player.time)}
        onChange={(event) => player.seek(Number(event.target.value))}
        aria-label={t("learn.position")}
        dir="ltr"
      />
      <div className="song-times small muted" dir="ltr">
        <span>{formatTime(player.time).replace(/\.\d$/, "")}</span>
        <span>{player.duration ? formatTime(player.duration).replace(/\.\d$/, "") : "--:--"}</span>
      </div>
      <div className="song-buttons" dir="ltr">
        <button
          type="button"
          className="icon-button"
          onClick={() => player.seek(player.time - 5)}
          aria-label={t("learn.back5")}
          title={t("learn.back5")}
        >
          <SkipBackIcon />
        </button>
        <button
          type="button"
          className="song-play-button"
          onClick={player.toggle}
          disabled={!player.ready}
          aria-label={player.playing ? t("slides.pause") : t("slides.play")}
        >
          {player.playing ? <PauseFilledIcon /> : <PlayFilledIcon />}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => player.seek(player.time + 5)}
          aria-label={t("learn.forward5")}
          title={t("learn.forward5")}
        >
          <SkipForwardIcon />
        </button>
      </div>
      <div className="song-rates" role="group" aria-label={t("learn.speed")}>
        {rates.map((r) => (
          <button key={r} type="button" aria-pressed={player.rate === r} onClick={() => player.setRate(r)}>
            {calendar.formatNumber(r)}×
          </button>
        ))}
      </div>
    </div>
  );
}

function LyricsEditor({
  song,
  player,
  syncing,
  onSync,
  onStopSync,
  onLines,
  onChange,
  onTranslate,
  translating,
}: {
  song: Song;
  player: SongPlayer;
  syncing: number | null;
  onSync: (from: number) => void;
  onStopSync: () => void;
  onLines: (update: (lines: SongLine[]) => SongLine[]) => void;
  onChange: (changes: SongChanges) => void;
  onTranslate?: () => void;
  translating: boolean;
}) {
  const { t } = useI18n();
  const [pasting, setPasting] = useState(!song.lines.length);
  const [text, setText] = useState("");
  const [translations, setTranslations] = useState("");
  const source = song.source_lang;
  const target = song.target_lang;
  const lines = song.lines;
  const set = (index: number, changes: Partial<SongLine>) =>
    onLines((all) => all.map((l, i) => (i === index ? { ...l, ...changes } : l)));

  function applyPaste() {
    const parsed = parseLyrics(text);
    const translated = translations.split(/\r?\n/).map((l) => l.trim());
    const nonEmpty = translated.filter(Boolean);
    onLines(() =>
      parsed.map((line, i) => ({ ...line, translation: nonEmpty.length ? (translated[i] ?? "") : "" })),
    );
    setPasting(false);
    setText("");
    setTranslations("");
  }

  const shift = (seconds: number) =>
    onLines((all) =>
      all.map((l) =>
        l.time === null ? l : { ...l, time: Math.max(0, Math.round((l.time + seconds) * 100) / 100) },
      ),
    );

  if (pasting) {
    return (
      <div className="lyrics-paste">
        <h2>
          <LyricsIcon /> {t("learn.pasteLyrics")}
        </h2>
        <p className="muted small">{t("learn.pasteHint")}</p>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">
              <LangTag code={source} /> {t("learn.original")}
            </span>
            <textarea
              rows={14}
              dir={dirOf(source)}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                "[00:12.50] Hello, it's me\n[00:17.30] I was wondering if after all these years..."
              }
            />
          </label>
          <label className="field">
            <span className="field-label">
              <LangTag code={target} /> {t("learn.translationOptional")}
            </span>
            <textarea
              rows={14}
              dir={dirOf(target)}
              value={translations}
              onChange={(event) => setTranslations(event.target.value)}
              placeholder={t("learn.translationPastePlaceholder")}
            />
          </label>
        </div>
        <div className="row wrap">
          <label className="file-pick small">
            <UploadIcon /> {t("learn.importLrc")}
            <input
              type="file"
              accept=".lrc,.txt,text/plain"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) setText(await file.text());
              }}
            />
          </label>
          <span className="spacer" />
          {lines.length > 0 && (
            <button type="button" className="ghost" onClick={() => setPasting(false)}>
              {t("common.cancel")}
            </button>
          )}
          <button type="button" className="primary" disabled={!text.trim()} onClick={applyPaste}>
            <CheckIcon /> {t("learn.useLyrics")}
          </button>
        </div>
        <div className="form-grid song-links">
          <label className="field">
            <span className="field-label">{t("learn.youtubeLink")}</span>
            <input
              type="url"
              dir="ltr"
              defaultValue={song.youtube_url ?? ""}
              onBlur={(event) => onChange({ youtube_url: event.target.value.trim() || null })}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>
          <label className="field">
            <span className="field-label">{t("learn.artist")}</span>
            <input
              type="text"
              dir="auto"
              defaultValue={song.artist}
              onBlur={(event) => onChange({ artist: event.target.value.trim() })}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="lyrics-editor">
      <div className="lyrics-editor-bar">
        <button
          type="button"
          className="primary"
          onClick={() => (syncing !== null ? onStopSync() : onSync(0))}
          disabled={!lines.length || !player.ready}
        >
          <TimerIcon /> {syncing !== null ? t("learn.syncStop") : t("learn.tapSync")}
        </button>
        {onTranslate && (
          <button
            type="button"
            className="ghost ai-ghost"
            onClick={onTranslate}
            disabled={translating || !lines.length}
          >
            <SparkleIcon /> {translating ? t("learn.translating") : t("learn.translateAll")}
          </button>
        )}
        <button type="button" className="ghost" onClick={() => setPasting(true)}>
          <LyricsIcon /> {t("learn.replaceLyrics")}
        </button>
        <span className="lyrics-shift">
          <span className="muted small">{t("learn.shiftAll")}</span>
          <button type="button" className="small" onClick={() => shift(-0.5)}>
            −0.5s
          </button>
          <button type="button" className="small" onClick={() => shift(0.5)}>
            +0.5s
          </button>
        </span>
      </div>
      <p className="hint">{t("learn.syncHint")}</p>
      <ol className="lyrics-rows">
        {lines.map((line, index) => (
          <li key={index} data-syncing={syncing === index}>
            <div className="lyrics-time" dir="ltr">
              <button
                type="button"
                className="time-chip"
                onClick={() => line.time !== null && player.seek(line.time)}
                title={t("learn.jump")}
              >
                {formatTime(line.time)}
              </button>
              <span className="time-nudge">
                <button
                  type="button"
                  onClick={() =>
                    set(index, {
                      time: Math.max(0, Math.round(((line.time ?? player.now()) - 0.2) * 100) / 100),
                    })
                  }
                  aria-label="-0.2s"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => set(index, { time: Math.round(player.now() * 100) / 100 })}
                  title={t("learn.setNow")}
                  aria-label={t("learn.setNow")}
                >
                  ⏱
                </button>
                <button
                  type="button"
                  onClick={() =>
                    set(index, { time: Math.round(((line.time ?? player.now()) + 0.2) * 100) / 100 })
                  }
                  aria-label="+0.2s"
                >
                  +
                </button>
              </span>
            </div>
            <div className="lyrics-fields">
              <input
                type="text"
                dir={dirOf(source)}
                value={line.text}
                onChange={(event) => set(index, { text: event.target.value })}
                aria-label={t("learn.original")}
              />
              <input
                type="text"
                dir={dirOf(target)}
                value={line.translation}
                placeholder={t("learn.translationPlaceholder")}
                onChange={(event) => set(index, { translation: event.target.value })}
                aria-label={t("learn.translation")}
              />
            </div>
            <div className="lyrics-row-actions">
              <button
                type="button"
                className="icon-button small"
                title={t("learn.syncFromHere")}
                aria-label={t("learn.syncFromHere")}
                onClick={() => onSync(index)}
              >
                <PlayFilledIcon />
              </button>
              <button
                type="button"
                className="icon-button small"
                title={t("learn.addLineBelow")}
                aria-label={t("learn.addLineBelow")}
                onClick={() =>
                  onLines((all) => [
                    ...all.slice(0, index + 1),
                    { time: null, text: "", translation: "" },
                    ...all.slice(index + 1),
                  ])
                }
              >
                <PlusIcon />
              </button>
              <button
                type="button"
                className="icon-button small danger"
                title={t("common.delete")}
                aria-label={t("common.delete")}
                onClick={() => onLines((all) => all.filter((_, i) => i !== index))}
              >
                <TrashIcon />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="ghost"
        onClick={() => onLines((all) => [...all, { time: null, text: "", translation: "" }])}
      >
        <PlusIcon /> {t("learn.addLine")}
      </button>
    </div>
  );
}

function WordDialog({
  word,
  line,
  song,
  decks,
  canEdit,
  aiEnabled,
  onClose,
}: {
  word: string;
  line: string;
  song: Song;
  decks: LangDeck[];
  canEdit: boolean;
  aiEnabled: boolean;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const [result, setResult] = useState<{ card: CardFields; explanation: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matching = useMemo(
    () => decks.filter((d) => d.source_lang === song.source_lang),
    [decks, song.source_lang],
  );
  const [deckId, setDeckId] = useState<number | null>(song.deck_id ?? matching[0]?.id ?? null);
  const [saved, setSaved] = useState(false);

  const explain = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await learnApi.explain({
          word,
          context: line,
          source_lang: song.source_lang,
          target_lang: song.target_lang,
        }),
      );
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }, [word, line, song.source_lang, song.target_lang, i18n]);

  useEffect(() => {
    speak(word, song.source_lang);
    if (aiEnabled) void explain();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!deckId) return;
    try {
      const card = result?.card ?? {
        front: word,
        back: "",
        pronunciation: "",
        part_of_speech: "",
        example: line,
        example_translation: "",
        notes: "",
        image: null,
        tags: [],
      };
      await learnApi.addCard(deckId, {
        ...card,
        example: card.example || line,
        tags: [...card.tags, song.title].slice(0, 20),
      });
      setSaved(true);
      toast(t("learn.wordSaved"), "success");
      await client.invalidateQueries({ queryKey: learnKeys.decks });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  return (
    <Modal title={word} icon={SparkleIcon} onClose={onClose} size="md">
      <div className="word-dialog stack">
        <div className="word-head" dir={dirOf(song.source_lang)}>
          <strong>{word}</strong>
          {result?.card.pronunciation && <span className="ipa muted">{result.card.pronunciation}</span>}
          {result?.card.part_of_speech && <span className="pos small">{result.card.part_of_speech}</span>}
          <button
            type="button"
            className="icon-button"
            onClick={() => speak(word, song.source_lang)}
            aria-label={t("learn.listen")}
          >
            <SpeakerIcon />
          </button>
        </div>
        <p className="muted small word-line" dir={dirOf(song.source_lang)}>
          “{line}”
        </p>
        {busy && <p className="muted">{t("learn.aiThinking")}</p>}
        {result && (
          <>
            <p className="word-meaning" dir={dirOf(song.target_lang)}>
              {result.card.back}
            </p>
            {result.explanation && (
              <div className="word-explain small" dir="auto">
                {result.explanation}
              </div>
            )}
            {result.card.example && (
              <p className="small" dir={dirOf(song.source_lang)}>
                {result.card.example}
                {result.card.example_translation && (
                  <span className="muted" dir={dirOf(song.target_lang)}>
                    {" "}
                    — {result.card.example_translation}
                  </span>
                )}
              </p>
            )}
          </>
        )}
        {!aiEnabled && <p className="muted small">{t("learn.aiOff")}</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {canEdit && (
          <div className="word-save">
            {matching.length ? (
              <>
                <select
                  value={deckId ?? ""}
                  onChange={(event) => setDeckId(Number(event.target.value) || null)}
                  aria-label={t("learn.saveWordsTo")}
                >
                  {matching.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.icon} {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void save()}
                  disabled={saved || busy}
                >
                  {saved ? <CheckIcon /> : <PlusIcon />} {saved ? t("learn.saved") : t("learn.saveAsCard")}
                </button>
              </>
            ) : (
              <p className="muted small">
                {t("learn.noMatchingDeck", { lang: t(lang(song.source_lang).label) })}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
