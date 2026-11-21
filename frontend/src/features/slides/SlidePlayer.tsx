/**
 * Presenting a deck full screen: arrows / space / click to move, automatic advance
 * (per-slide duration or the deck's), looping, background music, speaker notes (N),
 * a slide overview (G) and a progress bar. Controls fade out while the mouse is still.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FullscreenIcon,
  GridIcon,
  MusicIcon,
  NotesIcon,
  PauseFilledIcon,
  PlayFilledIcon,
  VolumeIcon,
} from "../../components/Icons";
import { useI18n } from "../../i18n";
import type { Deck } from "../../types5";
import { SlideView } from "./SlideView";

export function SlidePlayer({
  deck,
  start = 0,
  onClose,
}: {
  deck: Deck;
  start?: number;
  onClose: () => void;
}) {
  const { t, calendar } = useI18n();
  const slides = deck.slides.filter((s) => !s.hidden);
  const [index, setIndex] = useState(() => Math.min(Math.max(0, start), Math.max(0, slides.length - 1)));
  const [playing, setPlaying] = useState(deck.auto_seconds > 0 || slides.some((s) => s.duration > 0));
  const [notes, setNotes] = useState(false);
  const [overview, setOverview] = useState(false);
  const [idle, setIdle] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slide = slides[index];
  const seconds = slide ? slide.duration || deck.auto_seconds : 0;

  const go = useCallback(
    (next: number) => {
      if (!slides.length) return;
      if (next >= slides.length) {
        if (deck.loop) next = 0;
        else {
          setPlaying(false);
          return;
        }
      }
      setIndex(Math.max(0, next));
      setElapsed(0);
    },
    [slides.length, deck.loop],
  );

  // Full screen on open; leaving full screen does not close the player.
  useEffect(() => {
    const element = root.current;
    element?.requestFullscreen?.().catch(() => undefined);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // Automatic advance.
  useEffect(() => {
    if (!playing || !seconds || overview) return;
    const timer = setInterval(() => {
      setElapsed((value) => {
        if (value + 0.1 >= seconds) {
          go(index + 1);
          return 0;
        }
        return value + 0.1;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [playing, seconds, index, go, overview]);

  // Music follows play/pause.
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, deck.music_volume / 100));
    element.muted = muted;
    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  }, [playing, muted, deck.music_volume]);

  useEffect(() => {
    // Start the music with the first interaction even when the deck does not auto-play.
    void audio.current?.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const rtl = document.documentElement.dir === "rtl";
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (event.key === "Escape") {
        if (overview) setOverview(false);
        else onClose();
      } else if ([forward, "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) {
        event.preventDefault();
        go(index + 1);
      } else if ([back, "ArrowUp", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(slides.length - 1);
      else if (event.key.toLowerCase() === "n") setNotes((v) => !v);
      else if (event.key.toLowerCase() === "g") setOverview((v) => !v);
      else if (event.key.toLowerCase() === "p") setPlaying((v) => !v);
      else if (event.key.toLowerCase() === "m") setMuted((v) => !v);
      else if (event.key.toLowerCase() === "f")
        void root.current?.requestFullscreen?.().catch(() => undefined);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, index, slides.length, overview, onClose]);

  function wake() {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  }

  if (!slide) {
    return createPortal(
      <div className="slide-player" ref={root}>
        <button type="button" className="player-close" onClick={onClose}>
          <CloseIcon />
        </button>
        <p className="player-empty">{t("slides.noSlides")}</p>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="slide-player"
      ref={root}
      data-idle={idle}
      onMouseMove={wake}
      data-transition={deck.transition}
    >
      {deck.music_url && <audio ref={audio} src={deck.music_url} loop preload="auto" />}
      {overview ? (
        <div className="player-overview">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-current={i === index}
              onClick={() => {
                go(i);
                setOverview(false);
              }}
            >
              <SlideView slide={s} theme={deck.theme} />
              <span>{calendar.formatNumber(i + 1)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="player-stage"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const rtl = document.documentElement.dir === "rtl";
            const left = event.clientX - box.left < box.width * 0.3;
            go(left !== rtl ? index - 1 : index + 1);
          }}
        >
          <div className="player-slide" key={slide.id}>
            <SlideView slide={slide} theme={deck.theme} />
          </div>
        </div>
      )}

      {notes && slide.notes && !overview && (
        <div className="player-notes" dir="auto">
          {slide.notes}
        </div>
      )}

      {seconds > 0 && playing && !overview && (
        <div className="player-timer" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (elapsed / seconds) * 100)}%` }} />
        </div>
      )}
      <div className="player-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
      </div>

      <div className="player-controls" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => go(index - 1)}
          aria-label={t("slides.previous")}
          disabled={index === 0}
        >
          <ChevronLeftIcon />
        </button>
        <span className="player-count">
          {calendar.formatNumber(index + 1)} / {calendar.formatNumber(slides.length)}
        </span>
        <button type="button" onClick={() => go(index + 1)} aria-label={t("slides.next")}>
          <ChevronRightIcon />
        </button>
        <span className="player-sep" />
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? t("slides.pause") : t("slides.autoplay")}
          title={playing ? t("slides.pause") : t("slides.autoplay")}
        >
          {playing ? <PauseFilledIcon /> : <PlayFilledIcon />}
        </button>
        {deck.music_url && (
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-pressed={!muted}
            title={deck.music_name || t("slides.music")}
            data-off={muted}
          >
            {muted ? <MusicIcon /> : <VolumeIcon />}
          </button>
        )}
        <button
          type="button"
          onClick={() => setNotes(!notes)}
          aria-pressed={notes}
          title={t("slides.speakerNotes")}
        >
          <NotesIcon />
        </button>
        <button
          type="button"
          onClick={() => setOverview(!overview)}
          aria-pressed={overview}
          title={t("slides.overview")}
        >
          <GridIcon />
        </button>
        <button
          type="button"
          onClick={() => void root.current?.requestFullscreen?.().catch(() => undefined)}
          title={t("slides.fullscreen")}
        >
          <FullscreenIcon />
        </button>
        <button type="button" onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </button>
      </div>
    </div>,
    document.body,
  );
}
