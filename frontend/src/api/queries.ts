/**
 * Server state with TanStack Query: caching, background refresh and optimistic updates.
 *
 * Each signed-in account gets its own QueryClient (see App.tsx), so cached data never
 * crosses accounts.
 */
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient as QueryClientType,
} from "@tanstack/react-query";

import { useToast } from "../components/Feedback";
import { useI18n } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { sortTasks } from "../lib/tasks";
import type { NoteChanges, NoteSummary, Task, TaskChanges, TaskInput } from "../types";
import { ApiError } from "./client";
import {
  aiApi,
  authApi,
  boardsApi,
  categoriesApi,
  chatsApi,
  dataApi,
  notesApi,
  tasksApi,
  type NoteQuery,
} from "./endpoints";

export const queryKeys = {
  categories: ["categories"] as const,
  tasks: ["tasks"] as const,
  notes: (query: NoteQuery) => ["notes", query] as const,
  allNotes: ["notes"] as const,
  note: (id: number) => ["note", id] as const,
  chats: ["chats"] as const,
  chat: (id: number) => ["chat", id] as const,
  aiStatus: ["ai-status"] as const,
  boards: ["boards"] as const,
  board: (id: number) => ["board", id] as const,
  card: (boardId: number, cardId: number) => ["card", boardId, cardId] as const,
  sessions: ["sessions"] as const,
  dataSummary: ["data-summary"] as const,
  vaultStatus: ["vault-status"] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Never retry client errors (401, 404, ...); retry network/server errors once.
        retry: (count, error) =>
          count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

export const useCategories = () => useQuery({ queryKey: queryKeys.categories, queryFn: categoriesApi.list });

export const useBoards = () => useQuery({ queryKey: queryKeys.boards, queryFn: boardsApi.list });

export const useBoard = (id: number) =>
  useQuery({ queryKey: queryKeys.board(id), queryFn: () => boardsApi.get(id), staleTime: 5_000 });

export const useCard = (boardId: number, cardId: number | null) =>
  useQuery({
    queryKey: queryKeys.card(boardId, cardId ?? 0),
    queryFn: () => boardsApi.getCard(boardId, cardId as number),
    enabled: cardId !== null,
    staleTime: 0,
  });

export const useSessions = () => useQuery({ queryKey: queryKeys.sessions, queryFn: authApi.sessions });

export const useDataSummary = () =>
  useQuery({ queryKey: queryKeys.dataSummary, queryFn: dataApi.summary, staleTime: 0 });

export const useTasks = () => useQuery({ queryKey: queryKeys.tasks, queryFn: tasksApi.list });

export const useNotes = (query: NoteQuery = {}) =>
  useQuery({
    queryKey: queryKeys.notes(query),
    queryFn: ({ signal }) => notesApi.list(query, signal),
    placeholderData: (previous) => previous,
  });

export const useNote = (id: number) =>
  useQuery({ queryKey: queryKeys.note(id), queryFn: () => notesApi.get(id), staleTime: 0 });

export const useChats = () => useQuery({ queryKey: queryKeys.chats, queryFn: chatsApi.list });

export const useChat = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.chat(id ?? 0),
    queryFn: () => chatsApi.get(id ?? 0),
    enabled: id !== null,
  });

export const useAiStatus = () =>
  useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: aiApi.status,
    staleTime: 60_000,
    retry: 0,
    refetchInterval: (query) => (query.state.data?.model_available ? false : 15_000),
  });

function useErrorToast() {
  const toast = useToast();
  const i18n = useI18n();
  return (error: unknown) => toast(errorMessage(error, i18n), "error");
}

/** Task changes are applied to the cache first, then saved; failures roll back. */
export function useTaskActions() {
  const client = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const onError = useErrorToast();

  const setTasks = (update: (tasks: Task[]) => Task[]) =>
    client.setQueryData<Task[]>(queryKeys.tasks, (tasks) => sortTasks(update(tasks ?? [])));
  const refreshCounts = () => client.invalidateQueries({ queryKey: queryKeys.categories });

  const add = useMutation({
    mutationFn: (input: TaskInput) => tasksApi.create(input),
    onSuccess: (task) => {
      setTasks((tasks) => [...tasks, task]);
      refreshCounts();
      toast(t("tasks.added"));
    },
    onError,
  });

  const update = useMutation({
    mutationFn: ({ task, changes }: { task: Task; changes: TaskChanges }) =>
      tasksApi.update(task.id, changes),
    onMutate: ({ task, changes }) => {
      const previous = client.getQueryData<Task[]>(queryKeys.tasks);
      setTasks((tasks) => tasks.map((t2) => (t2.id === task.id ? { ...t2, ...changes } : t2)));
      return { previous };
    },
    onSuccess: (saved) => {
      setTasks((tasks) => tasks.map((t2) => (t2.id === saved.id ? saved : t2)));
      refreshCounts();
    },
    onError: (error, _variables, context) => {
      if (context?.previous) client.setQueryData(queryKeys.tasks, context.previous);
      onError(error);
    },
  });

  const remove = useMutation({
    mutationFn: (task: Task) => tasksApi.remove(task.id),
    onMutate: (task) => {
      const previous = client.getQueryData<Task[]>(queryKeys.tasks);
      setTasks((tasks) => tasks.filter((t2) => t2.id !== task.id));
      return { previous };
    },
    onSuccess: (_result, task) => {
      refreshCounts();
      toast(t("tasks.deleted"), "success", {
        label: t("common.undo"),
        run: () => add.mutate({ title: task.title, due_date: task.due_date, category_id: task.category_id }),
      });
    },
    onError: (error, _task, context) => {
      if (context?.previous) client.setQueryData(queryKeys.tasks, context.previous);
      onError(error);
    },
  });

  return {
    add: (input: TaskInput) => add.mutateAsync(input),
    update: (task: Task, changes: TaskChanges) => update.mutate({ task, changes }),
    toggle: (task: Task) => update.mutate({ task, changes: { is_done: !task.is_done } }),
    remove: (task: Task) => remove.mutate(task),
  };
}

/** Updates a note everywhere it is cached (detail and lists). */
export function patchNoteInCache(client: QueryClientType, id: number, changes: Partial<NoteSummary>) {
  client.setQueriesData<NoteSummary[]>({ queryKey: queryKeys.allNotes }, (notes) =>
    notes?.map((note) => (note.id === id ? { ...note, ...changes } : note)),
  );
}

export function useNoteActions() {
  const client = useQueryClient();
  const onError = useErrorToast();

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: NoteChanges }) => notesApi.update(id, changes),
    onMutate: ({ id, changes }) => {
      if ("is_favorite" in changes) patchNoteInCache(client, id, { is_favorite: changes.is_favorite });
    },
    onSuccess: (note) => {
      client.setQueryData(queryKeys.note(note.id), note);
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      client.invalidateQueries({ queryKey: queryKeys.categories });
    },
    onError: (error) => {
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      onError(error);
    },
  });

  return {
    toggleFavorite: (note: NoteSummary) =>
      update.mutate({ id: note.id, changes: { is_favorite: !note.is_favorite } }),
    update: (id: number, changes: NoteChanges) => update.mutateAsync({ id, changes }),
  };
}
