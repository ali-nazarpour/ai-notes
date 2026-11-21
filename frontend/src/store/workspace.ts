/**
 * The selected workspace of each account on this device (localStorage).
 *
 * The API client sends it as the X-Workspace-Id header. null means "the account's default
 * workspace" (the server picks the oldest one the user owns).
 */
import { useSyncExternalStore } from "react";

import type { ColorName, Theme } from "../types";
import { accountStore } from "./accounts";

const key = (userId: number) => `notes.workspace.${userId}`;
const listeners = new Set<() => void>();
const memory = new Map<number, number | null>();

function read(userId: number): number | null {
  if (memory.has(userId)) return memory.get(userId) ?? null;
  let value: number | null = null;
  try {
    const raw = localStorage.getItem(key(userId));
    value = raw ? Number(raw) || null : null;
  } catch {
    value = null;
  }
  memory.set(userId, value);
  return value;
}

export const workspaceStore = {
  get: read,

  set(userId: number, workspaceId: number | null): void {
    memory.set(userId, workspaceId);
    try {
      if (workspaceId == null) localStorage.removeItem(key(userId));
      else localStorage.setItem(key(userId), String(workspaceId));
    } catch {
      // The choice is kept for this session only.
    }
    listeners.forEach((listener) => listener());
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function getActiveWorkspaceId(): number | null {
  const active = accountStore.getActive();
  return active ? read(active.user.id) : null;
}

export function useSelectedWorkspace(userId: number): number | null {
  return useSyncExternalStore(workspaceStore.subscribe, () => read(userId));
}

/** Theme / accent of the current workspace (null = use the account's own preference). */
export interface WorkspaceLook {
  theme: Theme | null;
  accent: ColorName | null;
}

let look: WorkspaceLook | null = null;
const lookListeners = new Set<() => void>();

export const workspaceLook = {
  get: (): WorkspaceLook | null => look,
  set(next: WorkspaceLook | null): void {
    if (look?.theme === next?.theme && look?.accent === next?.accent) return;
    look = next;
    lookListeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    lookListeners.add(listener);
    return () => lookListeners.delete(listener);
  },
};

export function useWorkspaceLook(): WorkspaceLook | null {
  return useSyncExternalStore(workspaceLook.subscribe, workspaceLook.get);
}
