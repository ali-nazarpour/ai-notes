/**
 * The unlocked vault key, kept only in memory (never in storage).
 *
 * It survives navigation between pages but is dropped after a period of inactivity
 * (auto-lock), when the account changes, and on page reload.
 */
import { useSyncExternalStore } from "react";

interface State {
  userId: number | null;
  key: CryptoKey | null;
  lastActivity: number;
}

let state: State = { userId: null, key: null, lastActivity: 0 };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export const AUTO_LOCK_KEY = "notes.vaultAutoLock";
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60] as const;

function autoLockMinutes(): number {
  try {
    const value = Number(JSON.parse(localStorage.getItem(AUTO_LOCK_KEY) ?? "5"));
    return Number.isFinite(value) && value > 0 ? value : 5;
  } catch {
    return 5;
  }
}

function emit(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function onActivity() {
  if (state.key) state.lastActivity = Date.now();
}

function startTimer() {
  if (timer) return;
  for (const event of ["pointerdown", "keydown", "scroll"]) {
    window.addEventListener(event, onActivity, { passive: true, capture: true });
  }
  timer = setInterval(() => {
    if (state.key && Date.now() - state.lastActivity > autoLockMinutes() * 60_000) vaultSession.lock();
  }, 10_000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  for (const event of ["pointerdown", "keydown", "scroll"]) {
    window.removeEventListener(event, onActivity, { capture: true });
  }
}

export const vaultSession = {
  unlock(userId: number, key: CryptoKey) {
    emit({ userId, key, lastActivity: Date.now() });
    startTimer();
  },
  lock() {
    stopTimer();
    emit({ userId: null, key: null, lastActivity: 0 });
  },
  keyFor(userId: number): CryptoKey | null {
    return state.userId === userId ? state.key : null;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useVaultKey(userId: number): CryptoKey | null {
  return useSyncExternalStore(vaultSession.subscribe, () => vaultSession.keyFor(userId));
}
