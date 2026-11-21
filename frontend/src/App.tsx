/**
 * Root: providers, public pages, the sign-in gate and the routes.
 *
 * Each account + workspace gets its own QueryClient and the routes are keyed by both, so
 * switching account or workspace starts from a clean slate and no data crosses over.
 * Public pages (a published blog, password reset, invitation links) work signed out.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router";

import { setUnauthorizedHandler } from "./api/client";
import { notesApi } from "./api/endpoints";
import { createQueryClient } from "./api/queries";
import { FeedbackProvider } from "./components/Feedback";
import { Skeleton } from "./components/ui";
import { AuthScreen } from "./features/auth/AuthScreen";
import { CalendarPage } from "./features/calendar/CalendarPage";
import { HomePage } from "./features/home/HomePage";
import { LandingPage } from "./features/landing/LandingPage";
import { NotesPage } from "./features/notes/NotesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { WorkspaceProvider } from "./features/workspace/WorkspaceContext";
import { useAppearance } from "./hooks/useAppearance";
import { useFontScale } from "./hooks/useFontScale";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { I18nProvider, initialLanguage } from "./i18n";
import { AppShell } from "./layout/AppShell";
import { UpdatePrompt } from "./pwa/pwa";
import { accountStore, useAccounts } from "./store/accounts";
import { useSelectedWorkspace, useWorkspaceLook } from "./store/workspace";
import type { Language, SavedAccount, User } from "./types";

// Heavy pages load on first use instead of delaying the first screen.
function page<P extends object>(loader: () => Promise<React.ComponentType<P>>) {
  return lazy(async () => ({ default: await loader() }));
}

const NotePage = page(() => import("./features/notes/NotePage").then((m) => m.NotePage));
const TrashPage = page(() => import("./features/notes/TrashPage").then((m) => m.TrashPage));
const ChatPage = page(() => import("./features/chat/ChatPage").then((m) => m.ChatPage));
const BoardsPage = page(() => import("./features/boards/BoardsPage").then((m) => m.BoardsPage));
const BoardPage = page(() => import("./features/boards/BoardPage").then((m) => m.BoardPage));
const DocsPage = page(() => import("./features/docs/DocsPage").then((m) => m.DocsPage));
const DocSpacePage = page(() => import("./features/docs/DocSpacePage").then((m) => m.DocSpacePage));
const BlogPage = page(() => import("./features/blog/BlogPage").then((m) => m.BlogPage));
const PostEditorPage = page(() => import("./features/blog/PostEditorPage").then((m) => m.PostEditorPage));
const ProjectsPage = page(() => import("./features/projects/ProjectsPage").then((m) => m.ProjectsPage));
const ProjectPage = page(() => import("./features/projects/ProjectPage").then((m) => m.ProjectPage));
const SharedPage = page(() => import("./features/workspace/SharedPage").then((m) => m.SharedPage));
const AdminPage = page(() => import("./features/admin/AdminPage").then((m) => m.AdminPage));
const PublicBlogPage = page(() => import("./features/blog/PublicBlogPage").then((m) => m.PublicBlogPage));
const ResetPasswordPage = page(() =>
  import("./features/auth/ResetPasswordPage").then((m) => m.ResetPasswordPage),
);
const InvitePage = page(() => import("./features/auth/InvitePage").then((m) => m.InvitePage));
const AlarmsPage = page(() => import("./features/alarms/AlarmsPage").then((m) => m.AlarmsPage));
const SearchPage = page(() => import("./features/search/SearchPage").then((m) => m.SearchPage));
const DrivePage = page(() => import("./features/drive/DrivePage").then((m) => m.DrivePage));
const PublicDrivePage = page(() => import("./features/drive/PublicDrivePage").then((m) => m.PublicDrivePage));
const SlidesPage = page(() => import("./features/slides/SlidesPage").then((m) => m.SlidesPage));
const DeckEditorPage = page(() => import("./features/slides/DeckEditorPage").then((m) => m.DeckEditorPage));
const LearnPage = page(() => import("./features/learn/LearnPage").then((m) => m.LearnPage));
const LangDeckPage = page(() => import("./features/learn/LangDeckPage").then((m) => m.LangDeckPage));
const StudyPage = page(() => import("./features/learn/StudyPage").then((m) => m.StudyPage));
const SongPage = page(() => import("./features/learn/SongPage").then((m) => m.SongPage));
const PasswordsPage = lazy(() =>
  import("./features/vault/PasswordsPage").then((m) => ({ default: m.PasswordsPage })),
);

const lazyPage = (element: React.ReactNode) => (
  <Suspense fallback={<Skeleton rows={6} />}>{element}</Suspense>
);

setUnauthorizedHandler(() => {
  const active = accountStore.getActive();
  if (active) accountStore.signOut(active.user.id);
});

/** /notes/new (PWA shortcut): creates a note and opens it. */
function NewNoteRoute() {
  const navigate = useNavigate();
  const started = useRef(false); // StrictMode runs effects twice in development
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    notesApi
      .create({})
      .then((note) => navigate(`/notes/${note.id}`, { replace: true, state: { isNew: true } }))
      .catch(() => navigate("/notes", { replace: true }));
  }, [navigate]);
  return <Skeleton rows={4} />;
}

/** Old links (/ask/...) keep working after the rename to "Chatbot". */
function AskRedirect() {
  const { chatId } = useParams();
  return <Navigate to={chatId ? `/chat/${chatId}` : "/chat"} replace />;
}

function WorkspaceRoutes({ user, onAddAccount }: { user: User; onAddAccount: () => void }) {
  const client = useMemo(() => createQueryClient(), []);
  return (
    <QueryClientProvider client={client}>
      <WorkspaceProvider user={user}>
        <Routes>
          <Route element={<AppShell user={user} onAddAccount={onAddAccount} />}>
            <Route index element={<HomePage user={user} />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="notes/new" element={<NewNoteRoute />} />
            <Route path="notes/:id" element={lazyPage(<NotePage />)} />
            <Route path="trash" element={lazyPage(<TrashPage />)} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="boards" element={lazyPage(<BoardsPage />)} />
            <Route path="boards/:id" element={lazyPage(<BoardPage />)} />
            <Route path="docs" element={lazyPage(<DocsPage />)} />
            <Route path="docs/:spaceId/:pageId?" element={lazyPage(<DocSpacePage />)} />
            <Route path="blog" element={lazyPage(<BlogPage />)} />
            <Route path="blog/:postId" element={lazyPage(<PostEditorPage />)} />
            <Route path="projects" element={lazyPage(<ProjectsPage />)} />
            <Route path="projects/:id" element={lazyPage(<ProjectPage />)} />
            <Route path="shared" element={lazyPage(<SharedPage />)} />
            <Route path="passwords" element={lazyPage(<PasswordsPage user={user} />)} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="search" element={lazyPage(<SearchPage />)} />
            <Route path="alarms" element={lazyPage(<AlarmsPage />)} />
            <Route path="drive" element={lazyPage(<DrivePage />)} />
            <Route path="drive/:view" element={lazyPage(<DrivePage />)} />
            <Route path="drive/folders/:folderId" element={lazyPage(<DrivePage />)} />
            <Route path="drive/:view/folders/:folderId" element={lazyPage(<DrivePage />)} />
            <Route path="drive/item/:itemId" element={lazyPage(<DrivePage />)} />
            <Route path="slides" element={lazyPage(<SlidesPage />)} />
            <Route path="slides/:id" element={lazyPage(<DeckEditorPage />)} />
            <Route path="learn" element={lazyPage(<LearnPage />)} />
            <Route path="learn/decks/:id" element={lazyPage(<LangDeckPage />)} />
            <Route path="learn/study/:deckId?" element={lazyPage(<StudyPage />)} />
            <Route path="learn/songs/:id" element={lazyPage(<SongPage />)} />
            <Route path="chat/:chatId?" element={lazyPage(<ChatPage />)} />
            <Route path="ask/:chatId?" element={<AskRedirect />} />
            <Route path="admin/:section?" element={lazyPage(<AdminPage user={user} />)} />
            <Route
              path="settings/:section?"
              element={<SettingsPage user={user} onAddAccount={onAddAccount} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}

function SignedInApp({ user, onAddAccount }: { user: User; onAddAccount: () => void }) {
  const workspaceId = useSelectedWorkspace(user.id);
  return (
    <WorkspaceRoutes key={`${user.id}:${workspaceId ?? "default"}`} user={user} onAddAccount={onAddAccount} />
  );
}

interface GateProps {
  accounts: SavedAccount[];
  active: SavedAccount | null;
  adding: boolean;
  setAdding: (value: boolean) => void;
  setGuestLanguage: (language: Language) => void;
  landing: boolean;
  toggleTheme: () => void;
}

function AppRoutes({
  accounts,
  active,
  adding,
  setAdding,
  setGuestLanguage,
  landing,
  toggleTheme,
}: GateProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const publicClient = useMemo(() => createQueryClient(), []);
  const publicPath =
    location.pathname.startsWith("/w/") ||
    location.pathname.startsWith("/d/") ||
    location.pathname.startsWith("/reset-password") ||
    location.pathname.startsWith("/invite/");
  if (publicPath) {
    return (
      <QueryClientProvider client={publicClient}>
        <Routes>
          <Route path="/w/:slug/blog/:postSlug?" element={lazyPage(<PublicBlogPage />)} />
          <Route path="/reset-password" element={lazyPage(<ResetPasswordPage />)} />
          <Route path="/d/:token" element={lazyPage(<PublicDrivePage />)} />
          <Route
            path="/invite/:token"
            element={lazyPage(
              <InvitePage accounts={accounts} active={active} onLanguageChange={setGuestLanguage} />,
            )}
          />
        </Routes>
      </QueryClientProvider>
    );
  }
  if (landing) {
    return (
      <LandingPage
        signedIn={Boolean(active)}
        onLanguageChange={setGuestLanguage}
        onThemeToggle={toggleTheme}
      />
    );
  }
  const authMode =
    location.pathname === "/login" ? "login" : location.pathname === "/register" ? "register" : undefined;
  if (!active || adding) {
    return (
      <AuthScreen
        key={authMode ?? "default"}
        initialMode={authMode}
        accounts={accounts}
        onCancel={active ? () => setAdding(false) : undefined}
        onDone={() => {
          setAdding(false);
          if (authMode) void navigate("/", { replace: true });
        }}
        onLanguageChange={setGuestLanguage}
      />
    );
  }
  if (authMode) return <Navigate to="/" replace />;
  return <SignedInApp key={active.user.id} user={active.user} onAddAccount={() => setAdding(true)} />;
}

function AppSession() {
  const { pathname } = useLocation();
  const { accounts, active } = useAccounts();
  const [adding, setAdding] = useState(false);
  const [guestLanguage, setGuestLanguage] = useState<Language>(initialLanguage);
  const landing = pathname === "/welcome" || (pathname === "/" && !active);
  const language = active && !adding && !landing ? active.user.language : guestLanguage;
  const look = useWorkspaceLook();
  const [guestTheme, setGuestTheme] = useLocalStorage<"light" | "dark" | null>("notes.guest-theme", null);

  // The workspace theme is the default; a member who picked Light or Dark keeps that choice.
  const ownTheme = active?.user.theme ?? null;
  const theme = ownTheme && ownTheme !== "system" ? ownTheme : (look?.theme ?? ownTheme);
  useAppearance(
    landing || !active ? (guestTheme ?? theme) : theme,
    look?.accent ?? active?.user.accent_color ?? null,
  );
  useFontScale();

  return (
    <I18nProvider language={language}>
      <FeedbackProvider>
        <AppRoutes
          accounts={accounts}
          active={active}
          adding={adding}
          setAdding={setAdding}
          setGuestLanguage={setGuestLanguage}
          landing={landing}
          toggleTheme={() => {
            const dark =
              (document.documentElement.dataset.theme ??
                (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
            setGuestTheme(dark ? "light" : "dark");
          }}
        />
        <UpdatePrompt />
      </FeedbackProvider>
    </I18nProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppSession />
    </BrowserRouter>
  );
}
