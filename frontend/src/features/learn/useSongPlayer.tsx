/**
 * One player interface over an uploaded audio/video file (HTML media element) or a YouTube
 * video (YouTube IFrame Player API), with the current time polled for synced lyrics.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { Song } from "../../types5";
import { youtubeId } from "./langs";

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: () => void; onStateChange?: (event: { data: number }) => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApi: Promise<YTNamespace> | null = null;

function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApi) {
    youtubeApi = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        youtubeApi = null;
        reject(new Error("youtube"));
      };
      document.head.append(script);
    });
  }
  return youtubeApi;
}

export interface SongPlayer {
  time: number;
  duration: number;
  playing: boolean;
  ready: boolean;
  failed: boolean;
  rate: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  /** The current time read right now (not the last polled value). */
  now: () => number;
}

export function useSongPlayer(song: Song): { player: SongPlayer; view: ReactNode } {
  const media = useRef<HTMLMediaElement | null>(null);
  const yt = useRef<YTPlayer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRateState] = useState(1);
  const [hasVideo, setHasVideo] = useState(false);
  const videoId = !song.media_url && song.youtube_url ? youtubeId(song.youtube_url) : null;

  // YouTube
  useEffect(() => {
    if (!videoId || !host.current) return;
    let cancelled = false;
    const target = document.createElement("div");
    host.current.append(target);
    loadYouTube()
      .then((YT) => {
        if (cancelled) return;
        yt.current = new YT.Player(target, {
          videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, cc_load_policy: 0 },
          events: {
            onReady: () => {
              setReady(true);
              setDuration(yt.current?.getDuration() ?? 0);
            },
            onStateChange: (event) => setPlaying(event.data === 1),
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      yt.current?.destroy();
      yt.current = null;
      target.remove();
    };
  }, [videoId]);

  const now = useCallback(() => {
    if (media.current) return media.current.currentTime;
    return yt.current?.getCurrentTime?.() ?? 0;
  }, []);

  // Poll the time (YouTube has no time events; media elements fire too rarely).
  useEffect(() => {
    let frame = 0;
    let last = -1;
    const tick = () => {
      const current = now();
      if (Math.abs(current - last) > 0.04) {
        last = current;
        setTime(current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [now]);

  const player: SongPlayer = {
    time,
    duration,
    playing,
    ready: ready || !!song.media_url,
    failed,
    rate,
    now,
    play: () => {
      if (media.current) void media.current.play();
      else yt.current?.playVideo();
    },
    pause: () => {
      if (media.current) media.current.pause();
      else yt.current?.pauseVideo();
    },
    toggle: () => (playing ? player.pause() : player.play()),
    seek: (seconds: number) => {
      const value = Math.max(0, seconds);
      if (media.current) media.current.currentTime = value;
      else yt.current?.seekTo(value, true);
      setTime(value);
    },
    setRate: (value: number) => {
      setRateState(value);
      if (media.current) media.current.playbackRate = value;
      else yt.current?.setPlaybackRate(value);
    },
  };

  const mediaProps = {
    src: song.media_url ?? undefined,
    preload: "auto" as const,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      setDuration(event.currentTarget.duration || 0);
      setReady(true);
    },
    onError: () => setFailed(true),
  };

  let view: ReactNode = null;
  if (song.media_url) {
    // A <video> element plays audio files too; it is shown only when the file has a picture.
    view = (
      <video
        ref={(node) => void (media.current = node)}
        className="song-video"
        data-has-video={hasVideo}
        playsInline
        controls={false}
        {...mediaProps}
        onLoadedMetadata={(event) => {
          mediaProps.onLoadedMetadata(event);
          setHasVideo((event.currentTarget as HTMLVideoElement).videoWidth > 0);
        }}
      />
    );
  } else if (videoId) {
    view = <div className="song-youtube" ref={host} />;
  }
  return { player, view };
}
