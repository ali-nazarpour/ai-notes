/**
 * The signed-in layout: sidebar (desktop) or bottom bar (phone), top bar, page outlet,
 * quick add, keyboard shortcuts and status banners.
 *
 * Shortcuts (ignored while typing): "/" search, "n" new note, "t" new task, "q" quick add.
 */
import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";

import { authApi } from "../api/endpoints";
import { useAiStatus, useCategories, useTaskActions, useTasks } from "../api/queries";
import { CloseIcon, NotesIcon } from "../components/Icons";
import { useToast } from "../components/Feedback";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useOnline } from "../hooks/useOnline";
import { useI18n } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { today } from "../lib/calendar";
import { accountStore } from "../store/accounts";
import { TaskComposer } from "../features/tasks/TaskComposer";
import { useCreateNote } from "../features/notes/useCreateNote";
import type { User, UserChanges } from "../types";
import { BottomNav, Sidebar } from "./Navigation";
import { AlarmCenter } from "../features/alarms/AlarmCenter";
import { MusicProvider } from "../features/drive/MusicPlayer";
import { openSearch } from "./GlobalSearch";
import { TopBar } from "./TopBar";

export const TASK_INPUT_ID = "task-composer-input";

export function useUpdateUser(user: User) {
  const toast = useToast();
  const i18n = useI18n();
  return useCallback(
    async (changes: UserChanges) => {
      const previous = user;
      accountStore.updateUser({ ...user, ...changes }); // apply instantly
      try {
        accountStore.updateUser(await authApi.updateMe(changes));
      } catch (error) {
        accountStore.updateUser(previous);
        toast(errorMessage(error, i18n), "error");
      }
    },
    [user, toast, i18n],
  );
}

function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { data: categories = [] } = useCategories();
  const { add } = useTaskActions();
  const { createNote } = useCreateNote();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="dialog-header">
          <h2 id="quick-add-title">{t("quickAdd.title")}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>
        <p className="field-label">{t("tasks.newTask")}</p>
        <TaskComposer categories={categories} onAdd={add} defaultDate={today()} autoFocus />
        <button
          type="button"
          className="sheet-action"
          onClick={() => {
            onClose();
            createNote();
          }}
        >
          <span className="sheet-action-icon">
            <NotesIcon />
          </span>
          <span className="menu-item-text">
            <strong>{t("notes.new")}</strong>
            <span className="muted small">{t("quickAdd.noteHint")}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

export function AppShell({ user, onAddAccount }: { user: User; onAddAccount: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const online = useOnline();
  const [collapsed, setCollapsed] = useLocalStorage("notes.sidebarCollapsed", false);
  const [quickAdd, setQuickAdd] = useState(false);
  const { data: tasks = [] } = useTasks();
  const { data: aiStatus } = useAiStatus();
  const { createNote } = useCreateNote();
  const updateUser = useUpdateUser(user);
  const closeQuickAdd = useCallback(() => setQuickAdd(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".overlay")) return;
      const key = event.key.toLowerCase();
      if (key === "/") {
        event.preventDefault();
        openSearch();
      } else if (key === "n") {
        event.preventDefault();
        createNote();
      } else if (key === "t") {
        event.preventDefault();
        navigate("/tasks");
        setTimeout(() => document.getElementById(TASK_INPUT_ID)?.focus(), 50);
      } else if (key === "q") {
        event.preventDefault();
        setQuickAdd(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNote, navigate]);

  const openTasks = tasks.filter((task) => !task.is_done).length;

  return (
    <MusicProvider>
      <div className={collapsed ? "app sidebar-collapsed" : "app"}>
        <Sidebar
          collapsed={collapsed}
          theme={user.theme}
          openTaskCount={openTasks}
          onToggleCollapsed={() => setCollapsed(!collapsed)}
          onNewNote={() => createNote()}
          onThemeChange={(theme) => void updateUser({ theme })}
        />
        <div className="main">
          <TopBar onQuickAdd={() => setQuickAdd(true)} onAddAccount={onAddAccount} />
          <main className="content">
            {!online && (
              <div className="banner banner-warning" role="status">
                {t("status.offline")}
              </div>
            )}
            {aiStatus && !aiStatus.model_available && (
              <div className="banner" role="status">
                {t("status.aiUnavailable", {
                  detail: aiStatus.ollama_reachable
                    ? t("errors.model_not_found", { model: aiStatus.model })
                    : t("errors.ollama_unavailable"),
                })}
              </div>
            )}
            <Outlet />
          </main>
        </div>
        <BottomNav onQuickAdd={() => setQuickAdd(true)} />
        <AlarmCenter />
        {quickAdd && <QuickAddSheet onClose={closeQuickAdd} />}
      </div>
    </MusicProvider>
  );
}
