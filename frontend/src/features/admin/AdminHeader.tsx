import { useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { ApiError } from "../../api/client";
import { authApi } from "../../api/endpoints";
import { useToast } from "../../components/Feedback";
import { ChevronDownIcon, LinkIcon, LogOutIcon } from "../../components/Icons";
import { Avatar, displayName } from "../../components/ui";
import { useDismiss } from "../../hooks/useDismiss";
import { LANGUAGES, useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { APP_URL } from "../../lib/siteUrls";
import { accountStore } from "../../store/accounts";
import type { Language, SavedAccount, Theme } from "../../types";
import { ADMIN_SECTIONS, getAdminSection } from "./adminSections";

export function AdminHeader({
  account,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
}: {
  account: SavedAccount | null;
  language: Language;
  onLanguageChange: (value: Language) => void;
  theme: Theme;
  onThemeChange: (value: Theme) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const { pathname } = useLocation();
  const [openPanel, setOpenPanel] = useState<"account" | "sections" | null>(null);
  const [busy, setBusy] = useState(false);
  const header = useRef<HTMLElement>(null);
  const accountToggle = useRef<HTMLButtonElement>(null);
  const sectionsToggle = useRef<HTMLButtonElement>(null);
  const current = getAdminSection(pathname.split("/")[1]);
  const accountOpen = openPanel === "account";
  const sectionsOpen = openPanel === "sections";

  useDismiss(header, openPanel !== null, () => setOpenPanel(null));

  async function signOut() {
    if (!account || busy) return;
    setBusy(true);
    try {
      await authApi.logout(account.token);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        toast(errorMessage(err, i18n), "error");
        return;
      }
    } finally {
      setBusy(false);
    }
    setOpenPanel(null);
    accountStore.signOut(account.user.id);
  }

  return (
    <header
      className="admin-site-header"
      ref={header}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !openPanel) return;
        const trigger = accountOpen ? accountToggle : sectionsToggle;
        trigger.current?.focus();
        setOpenPanel(null);
      }}
    >
      <div className="admin-site-bar">
        <Link to="/" className="admin-site-brand" onClick={() => setOpenPanel(null)}>
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            <strong>{t("app.name")}</strong>
            <span className="muted small">{t("nav.admin")}</span>
          </span>
        </Link>
        <div className="admin-site-controls">
          <a
            href={APP_URL}
            className="button admin-app-link"
            aria-label={t("admin.portalOpenApp")}
            title={t("admin.portalOpenApp")}
          >
            <LinkIcon />
            <span>{t("admin.portalOpenApp")}</span>
          </a>
          {account && (
            <div className="admin-account-control">
              <button
                ref={accountToggle}
                type="button"
                className="admin-account-toggle"
                aria-label={t("account.menu", { email: account.user.email })}
                aria-controls="admin-account-panel"
                aria-expanded={accountOpen}
                onClick={() => setOpenPanel(accountOpen ? null : "account")}
              >
                <Avatar user={account.user} size="sm" />
                <bdi>{displayName(account.user)}</bdi>
                <ChevronDownIcon />
              </button>
              <div id="admin-account-panel" className="admin-account-panel" hidden={!accountOpen}>
                <div className="admin-account-identity">
                  <Avatar user={account.user} />
                  <div>
                    <strong>
                      <bdi>{displayName(account.user)}</bdi>
                    </strong>
                    <small dir="auto">{account.user.email}</small>
                  </div>
                </div>
                <div className="admin-account-preferences">
                  <label htmlFor="admin-theme">{t("settings.theme")}</label>
                  <select
                    id="admin-theme"
                    value={theme}
                    onChange={(event) => onThemeChange(event.target.value as Theme)}
                  >
                    <option value="system">{t("theme.system")}</option>
                    <option value="light">{t("theme.light")}</option>
                    <option value="dark">{t("theme.dark")}</option>
                  </select>
                  <label htmlFor="admin-language">{t("settings.section.language")}</label>
                  <select
                    id="admin-language"
                    value={language}
                    onChange={(event) => onLanguageChange(event.target.value as Language)}
                  >
                    {LANGUAGES.map(({ code, label }) => (
                      <option key={code} value={code} lang={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="admin-sign-out ghost danger"
                  onClick={() => void signOut()}
                  disabled={busy}
                >
                  <LogOutIcon /> {t("account.signOut")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {account && (
        <div className="admin-site-navigation">
          <button
            ref={sectionsToggle}
            type="button"
            className="admin-sections-toggle"
            aria-label={`${t("nav.admin")} · ${t(current.label)}`}
            aria-controls="admin-sections"
            aria-expanded={sectionsOpen}
            onClick={() => setOpenPanel(sectionsOpen ? null : "sections")}
          >
            <current.icon />
            <span>{t(current.label)}</span>
            <ChevronDownIcon />
          </button>
          <nav
            id="admin-sections"
            className="admin-sections"
            aria-label={t("nav.admin")}
            data-expanded={sectionsOpen}
          >
            {ADMIN_SECTIONS.map(({ id, label, icon: SectionIcon }) => (
              <Link
                key={id}
                to={`/${id}`}
                aria-current={id === current.id ? "page" : undefined}
                onClick={() => {
                  if (sectionsOpen) sectionsToggle.current?.focus();
                  setOpenPanel(null);
                }}
              >
                <SectionIcon />
                <span>{t(label)}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
