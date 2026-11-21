import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { ApiError, setUnauthorizedHandler } from "../../api/client";
import { createQueryClient } from "../../api/queries";
import { adminApi } from "../../api/v4";
import { FeedbackProvider } from "../../components/Feedback";
import { ShieldUserIcon } from "../../components/Icons";
import { Skeleton } from "../../components/ui";
import { useAppearance } from "../../hooks/useAppearance";
import { useFontScale } from "../../hooks/useFontScale";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { I18nProvider, initialLanguage, useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { accountStore, useAccounts } from "../../store/accounts";
import type { Language, SavedAccount, Theme } from "../../types";
import { AdminLoadError } from "./AdminDirectory";
import { AdminHeader } from "./AdminHeader";
import { AdminPage } from "./AdminPage";
import "./admin-shell.css";

function AdminSignIn() {
  const i18n = useI18n();
  const { t } = i18n;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const account = await adminApi.login(
        String(form.get("email") ?? ""),
        String(form.get("password") ?? ""),
      );
      accountStore.signIn(account);
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login">
      <section className="card admin-login-card" aria-labelledby="admin-login-heading">
        <span className="admin-login-mark">
          <ShieldUserIcon />
        </span>
        <div>
          <h1 id="admin-login-heading">{t("admin.portalSignIn")}</h1>
          <p className="muted">{t("admin.portalSignInHint")}</p>
        </div>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span className="field-label">{t("auth.email")}</span>
            <input name="email" type="email" autoComplete="username" required maxLength={254} dir="ltr" />
          </label>
          <label className="field">
            <span className="field-label">{t("auth.password")}</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              dir="ltr"
            />
          </label>
          {error && (
            <div className="admin-account-error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {t(busy ? "common.loading" : "auth.signIn")}
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminSession({ account }: { account: SavedAccount }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <VerifiedAdmin account={account} />
    </QueryClientProvider>
  );
}

function VerifiedAdmin({ account }: { account: SavedAccount }) {
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => adminApi.session(account.token),
    staleTime: 0,
  });
  const accessLost = session.error instanceof ApiError && [401, 403].includes(session.error.status);

  useEffect(() => {
    if (accessLost) accountStore.signOut(account.user.id);
  }, [accessLost, account.user.id]);

  return (
    <main className="admin-site-content">
      {accessLost || session.isPending ? (
        <Skeleton rows={4} />
      ) : session.isError ? (
        <AdminLoadError error={session.error} onRetry={() => void session.refetch()} />
      ) : (
        <Routes>
          <Route path="/:section?" element={<AdminPage user={session.data} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </main>
  );
}

export function AdminApp() {
  const { active } = useAccounts();
  const [defaultLanguage] = useState(initialLanguage);
  const [selectedLanguage, setLanguage] = useLocalStorage<Language | null>("notes.admin-language", null);
  const [selectedTheme, setTheme] = useLocalStorage<Theme | null>("notes.admin-theme", null);
  const language = selectedLanguage ?? active?.user.language ?? defaultLanguage;
  const theme = selectedTheme ?? active?.user.theme ?? "system";
  useAppearance(theme, active?.user.accent_color ?? null);
  useFontScale();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const account = accountStore.getActive();
      if (account) accountStore.signOut(account.user.id);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <I18nProvider language={language}>
      <FeedbackProvider>
        <BrowserRouter>
          <div className={active ? "admin-site" : "admin-site admin-site--login"}>
            <AdminHeader
              account={active}
              language={language}
              onLanguageChange={setLanguage}
              theme={theme}
              onThemeChange={setTheme}
            />
            {active ? <AdminSession key={active.token} account={active} /> : <AdminSignIn />}
          </div>
        </BrowserRouter>
      </FeedbackProvider>
    </I18nProvider>
  );
}
