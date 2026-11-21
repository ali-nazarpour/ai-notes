/**
 * Accounts signed in on this device, and the active one.
 *
 * Kept outside React because the API client needs the active token too; components
 * subscribe through useSyncExternalStore. Persisted in localStorage.
 */
import { useSyncExternalStore } from "react";

import type { SavedAccount, User } from "../types";

const KEY = "notes.accounts";

interface AccountsState {
  accounts: SavedAccount[];
  activeId: number | null;
}

const EMPTY: AccountsState = { accounts: [], activeId: null };

function load(): AccountsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AccountsState>;
    const accounts = Array.isArray(parsed.accounts)
      ? parsed.accounts.filter((a) => typeof a?.token === "string" && typeof a?.user?.id === "number")
      : [];
    const activeId = accounts.some((a) => a.user.id === parsed.activeId)
      ? (parsed.activeId ?? null)
      : (accounts[0]?.user.id ?? null);
    return { accounts, activeId };
  } catch {
    return EMPTY;
  }
}

let state: AccountsState = load();
const listeners = new Set<() => void>();

function save(next: AccountsState): void {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the session still works until the page is closed.
  }
  listeners.forEach((listener) => listener());
}

export const accountStore = {
  getState: (): AccountsState => state,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getActive(): SavedAccount | null {
    return state.accounts.find((a) => a.user.id === state.activeId) ?? null;
  },

  signIn(account: SavedAccount): void {
    const others = state.accounts.filter((a) => a.user.id !== account.user.id);
    save({ accounts: [account, ...others], activeId: account.user.id });
  },

  switchTo(userId: number): void {
    if (state.accounts.some((a) => a.user.id === userId)) save({ ...state, activeId: userId });
  },

  updateUser(user: User): void {
    save({
      ...state,
      accounts: state.accounts.map((a) => (a.user.id === user.id ? { ...a, user } : a)),
    });
  },

  signOut(userId: number): void {
    const accounts = state.accounts.filter((a) => a.user.id !== userId);
    const activeId = state.activeId === userId ? (accounts[0]?.user.id ?? null) : state.activeId;
    save({ accounts, activeId });
  },

  /** Re-reads localStorage (used by tests). */
  reload(): void {
    state = load();
    listeners.forEach((listener) => listener());
  },
};

export function getActiveToken(): string | null {
  return accountStore.getActive()?.token ?? null;
}

export function useAccounts(): AccountsState & { active: SavedAccount | null } {
  const current = useSyncExternalStore(accountStore.subscribe, accountStore.getState);
  const active = current.accounts.find((a) => a.user.id === current.activeId) ?? null;
  return { ...current, active };
}
