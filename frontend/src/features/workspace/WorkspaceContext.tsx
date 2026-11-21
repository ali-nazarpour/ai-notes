/**
 * The current workspace and the list of workspaces, for the whole signed-in app.
 *
 * Switching workspace stores the choice (store/workspace.ts); App re-mounts the routes
 * with a fresh query cache, so no data from one workspace shows up in another.
 * The workspace's theme / accent (if set) override the user's own preference.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { workspaceApi } from "../../api/v4";
import { workspaceLook, workspaceStore } from "../../store/workspace";
import type { User } from "../../types";
import type { Workspace } from "../../types4";

export const workspaceKeys = {
  current: ["workspace"] as const,
  list: ["workspaces"] as const,
  members: ["workspace-members"] as const,
  invites: ["workspace-invites"] as const,
  myInvites: ["my-invites"] as const,
  shared: ["shared-with-me"] as const,
};

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  canEdit: boolean;
  isAdmin: boolean;
  aiEnabled: boolean;
  switchTo: (id: number) => void;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ user, children }: { user: User; children: ReactNode }) {
  const client = useQueryClient();
  const current = useQuery({
    queryKey: workspaceKeys.current,
    queryFn: workspaceApi.current,
    staleTime: 60_000,
  });
  const list = useQuery({ queryKey: workspaceKeys.list, queryFn: workspaceApi.list, staleTime: 60_000 });
  const workspace = current.data ?? null;

  useEffect(() => {
    workspaceLook.set(workspace ? { theme: workspace.theme, accent: workspace.accent_color } : null);
  }, [workspace]);
  useEffect(() => () => workspaceLook.set(null), []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      workspaces: list.data ?? [],
      canEdit: workspace ? workspace.role !== "viewer" : true,
      isAdmin: workspace ? workspace.role === "owner" || workspace.role === "admin" : false,
      aiEnabled: workspace?.settings.ai_enabled ?? true,
      switchTo: (id: number) => workspaceStore.set(user.id, id),
      refresh: async () => {
        await Promise.all([
          client.invalidateQueries({ queryKey: workspaceKeys.current }),
          client.invalidateQueries({ queryKey: workspaceKeys.list }),
        ]);
      },
    }),
    [workspace, list.data, user.id, client],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    // Outside the provider (tests, public pages): behave like a personal workspace.
    return {
      workspace: null,
      workspaces: [],
      canEdit: true,
      isAdmin: true,
      aiEnabled: true,
      switchTo: () => undefined,
      refresh: async () => undefined,
    };
  }
  return value;
}
