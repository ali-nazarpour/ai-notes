/** Alarm sounds, synthesized with the Web Audio API (no audio files needed). */
import type { AlarmSound } from "../../types5";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function tone(
  ctx: AudioContext,
  start: number,
  frequency: number,
  length: number,
  type: OscillatorType,
  volume: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

const PATTERNS: Record<AlarmSound, (ctx: AudioContext, t: number) => void> = {
  chime: (ctx, t) => [659, 784, 988, 1319].forEach((f, i) => tone(ctx, t + i * 0.18, f, 0.9, "sine", 0.35)),
  bell: (ctx, t) => {
    tone(ctx, t, 880, 1.6, "triangle", 0.4);
    tone(ctx, t, 1760, 1.2, "sine", 0.12);
    tone(ctx, t + 0.8, 880, 1.6, "triangle", 0.35);
  },
  beep: (ctx, t) => [0, 0.25, 0.5, 0.75].forEach((d) => tone(ctx, t + d, 1000, 0.15, "square", 0.12)),
  digital: (ctx, t) =>
    [0, 0.12, 0.24, 0.6, 0.72, 0.84].forEach((d) => tone(ctx, t + d, 1500, 0.08, "square", 0.1)),
  soft: (ctx, t) => [523, 659, 784].forEach((f, i) => tone(ctx, t + i * 0.35, f, 1.4, "sine", 0.22)),
};

/** Plays the sound once. */
export function playSound(sound: AlarmSound): void {
  const ctx = audio();
  if (!ctx) return;
  PATTERNS[sound](ctx, ctx.currentTime + 0.05);
}

/** Repeats the sound every ~2 seconds until the returned stop() is called (max 90 s). */
export function loopSound(sound: AlarmSound): () => void {
  playSound(sound);
  const timer = setInterval(() => playSound(sound), 2200);
  const limit = setTimeout(() => clearInterval(timer), 90_000);
  return () => {
    clearInterval(timer);
    clearTimeout(limit);
  };
}

/** Browsers only allow sound after a user gesture; call this from any click to prepare. */
export function unlockAudio(): void {
  audio();
}
