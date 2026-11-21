/**
 * The music player of the drive's Music library: a queue (a folder or single tracks),
 * play/pause, next/previous, seek, volume, shuffle and repeat (off / all / one), a queue
 * list, and the operating system's media keys (Media Session API). It lives in the app
 * shell, so music keeps playing while you move between pages.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  CloseIcon,
  ListIcon,
  MusicIcon,
  PauseFilledIcon,
  PlayFilledIcon,
  RefreshIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
} from "../../components/Icons";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import { formatTime } from "../learn/langs";

export interface Track {
  id: number;
  name: string;
  url: string;
  album?: string;
}

type Repeat = "off" | "all" | "one";

interface Music {
  queue: Track[];
  current: Track | null;
  playing: boolean;
  shuffle: boolean;
  repeat: Repeat;
  play: (tracks: Track[], start?: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  isCurrent: (id: number) => boolean;
}

const MusicContext = createContext<Music | null>(null);

export function useMusic(): Music {
  const value = useContext(MusicContext);
  if (!value) throw new Error("useMusic outside MusicProvider");
  return value;
}

/** "01 - My_Song.mp3" -> "My Song" */
export function trackTitle(name: string): string {
  return (
    name
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/^\d{1,3}\s*[-._)]\s*/, "")
      .replace(/[_]+/g, " ")
      .trim() || name
  );
}

function shuffled(length: number, first: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useLocalStorage("music.shuffle", false);
  const [repeat, setRepeat] = useLocalStorage<Repeat>("music.repeat", "all");
  const [volume, setVolume] = useLocalStorage("music.volume", 0.8);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const current = queue.length ? (queue[order[position] ?? 0] ?? null) : null;

  const play = useCallback(
    (tracks: Track[], start = 0) => {
      if (!tracks.length) return;
      setQueue(tracks);
      setOrder(shuffle ? shuffled(tracks.length, start) : tracks.map((_, i) => i));
      setPosition(shuffle ? 0 : start);
      setPlaying(true);
    },
    [shuffle],
  );

  const next = useCallback(() => {
    if (!queue.length) return;
    if (position + 1 < order.length) setPosition(position + 1);
    else if (repeat !== "off") setPosition(0);
    else setPlaying(false);
  }, [queue.length, position, order.length, repeat]);

  const previous = useCallback(() => {
    const element = audio.current;
    if (element && element.currentTime > 3) element.currentTime = 0;
    else setPosition((p) => (p > 0 ? p - 1 : repeat === "all" ? order.length - 1 : 0));
  }, [order.length, repeat]);

  const toggle = useCallback(() => setPlaying((value) => !value && !!queue.length), [queue.length]);

  // Keep the <audio> element in step with the state.
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    if (playing && current) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [playing, current]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  // Operating-system media keys and lock screen.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle(current.name),
      album: current.album ?? "",
    });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", previous);
  }, [current, next, previous]);

  const toggleShuffle = () => {
    const now = order[position] ?? 0;
    const on = !shuffle;
    setShuffle(on);
    if (queue.length) {
      const nextOrder = on ? shuffled(queue.length, now) : queue.map((_, i) => i);
      setOrder(nextOrder);
      setPosition(nextOrder.indexOf(now));
    }
  };

  const value = useMemo<Music>(
    () => ({
      queue,
      current,
      playing,
      shuffle,
      repeat,
      play,
      toggle,
      next,
      previous,
      isCurrent: (id: number) => current?.id === id,
    }),
    [queue, current, playing, shuffle, repeat, play, toggle, next, previous],
  );

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio
        ref={audio}
        src={current?.url}
        preload="auto"
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (repeat === "one" && audio.current) {
            audio.current.currentTime = 0;
            void audio.current.play();
          } else next();
        }}
      />
      {current && (
        <MiniPlayer
          current={current}
          queue={queue}
          order={order}
          position={position}
          playing={playing}
          time={time}
          duration={duration}
          volume={volume}
          shuffle={shuffle}
          repeat={repeat}
          showQueue={showQueue}
          onToggle={toggle}
          onNext={next}
          onPrevious={previous}
          onSeek={(value) => {
            if (audio.current) audio.current.currentTime = value;
          }}
          onVolume={setVolume}
          onShuffle={toggleShuffle}
          onRepeat={() => setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off")}
          onQueue={() => setShowQueue(!showQueue)}
          onJump={(index) => setPosition(index)}
          onClose={() => {
            setPlaying(false);
            setQueue([]);
            setShowQueue(false);
          }}
        />
      )}
    </MusicContext.Provider>
  );
}

function MiniPlayer(props: {
  current: Track;
  queue: Track[];
  order: number[];
  position: number;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: Repeat;
  showQueue: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onQueue: () => void;
  onJump: (index: number) => void;
  onClose: () => void;
}) {
  const { t, calendar } = useI18n();
  const { current, playing, time, duration } = props;
  const clock = (value: number) =>
    formatTime(value)
      .replace(/\.\d$/, "")
      .replace(/\d/g, (d) => calendar.formatNumber(Number(d)));
  return (
    <div className="mini-player" data-playing={playing} role="region" aria-label={t("music.player")}>
      {props.showQueue && (
        <div className="mini-queue">
          <p className="mini-queue-title">
            {t("music.upNext")} ({calendar.formatNumber(props.queue.length)})
          </p>
          <ol>
            {props.order.map((index, position) => (
              <li key={`${index}-${position}`}>
                <button
                  type="button"
                  aria-current={position === props.position}
                  onClick={() => props.onJump(position)}
                >
                  <span className="mini-queue-n">{calendar.formatNumber(position + 1)}</span>
                  <span dir="auto">{trackTitle(props.queue[index].name)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="mini-art" aria-hidden="true">
        <MusicIcon />
        <span className="eq">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="mini-info">
        <strong dir="auto">{trackTitle(current.name)}</strong>
        <span className="muted small" dir="auto">
          {current.album || t("music.library")}
        </span>
      </div>
      <div className="mini-center">
        <div className="mini-buttons" dir="ltr">
          <button
            type="button"
            className="icon-button small"
            aria-pressed={props.shuffle}
            onClick={props.onShuffle}
            title={t("music.shuffle")}
          >
            <ShuffleIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={props.onPrevious}
            aria-label={t("music.previous")}
          >
            <SkipBackIcon />
          </button>
          <button
            type="button"
            className="mini-play"
            onClick={props.onToggle}
            aria-label={playing ? t("slides.pause") : t("slides.play")}
          >
            {playing ? <PauseFilledIcon /> : <PlayFilledIcon />}
          </button>
          <button type="button" className="icon-button" onClick={props.onNext} aria-label={t("music.next")}>
            <SkipForwardIcon />
          </button>
          <button
            type="button"
            className="icon-button small mini-repeat"
            aria-pressed={props.repeat !== "off"}
            data-mode={props.repeat}
            onClick={props.onRepeat}
            title={t(`music.repeat.${props.repeat}`)}
          >
            <RefreshIcon />
          </button>
        </div>
        <div className="mini-seek" dir="ltr">
          <span className="small muted">{clock(time)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.5}
            value={Math.min(time, duration || time)}
            onChange={(event) => props.onSeek(Number(event.target.value))}
            aria-label={t("learn.position")}
          />
          <span className="small muted">{duration ? clock(duration) : "--:--"}</span>
        </div>
      </div>
      <div className="mini-end">
        <label className="mini-volume" title={t("slides.volume")}>
          <VolumeIcon />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={props.volume}
            onChange={(event) => props.onVolume(Number(event.target.value))}
            aria-label={t("slides.volume")}
          />
        </label>
        <button
          type="button"
          className="icon-button small"
          aria-pressed={props.showQueue}
          onClick={props.onQueue}
          title={t("music.queue")}
        >
          <ListIcon />
        </button>
        <button
          type="button"
          className="icon-button small"
          onClick={props.onClose}
          aria-label={t("common.close")}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
