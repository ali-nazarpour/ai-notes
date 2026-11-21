/**
 * Settings: a grouped section list on the side (a scrollable tab bar on phones) and one
 * section at a time. Larger sections live in their own files.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Navigate, useParams } from "react-router";

import { authApi, categoriesApi } from "../../api/endpoints";
import { queryKeys, useAiStatus, useCategories } from "../../api/queries";
import { CategoryDialog } from "../../components/CategoryDialog";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  AlertIcon,
  DatabaseIcon,
  DownloadIcon,
  EditIcon,
  GlobeIcon,
  type IconComponent,
  KeyboardIcon,
  PaletteIcon,
  PlusIcon,
  ShieldIcon,
  SparkleIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
  UserPlusIcon,
  BuildingIcon,
  MailIcon,
  UsersIcon,
} from "../../components/Icons";
import { EditorSection, MembersSection, WorkspaceSection } from "../workspace/WorkspaceSettings";
import { Avatar, ColorPicker, displayName, PageHeader, ThemeSwitch } from "../../components/ui";
import { FONT_SCALES, useFontScale } from "../../hooks/useFontScale";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { LANGUAGES, useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { useUpdateUser } from "../../layout/AppShell";
import { LANGUAGE_KEY, TRANSLATION_LANGUAGES } from "../../lib/languages";
import { categoryStyle } from "../../lib/palette";
import { useInstallPrompt } from "../../pwa/pwa";
import { accountStore, useAccounts } from "../../store/accounts";
import type { Category, User, ViewMode } from "../../types";
import { APP_VERSION } from "../../version";
import { DataSection } from "./DataSection";
import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";

type SectionId =
  | "workspace"
  | "members"
  | "notifications"
  | "editor"
  | "profile"
  | "appearance"
  | "language"
  | "categories"
  | "accounts"
  | "ai"
  | "security"
  | "data"
  | "app"
  | "shortcuts"
  | "danger";

interface SectionDef {
  id: SectionId;
  label: TranslationKey;
  icon: IconComponent;
}

const GROUPS: { label: TranslationKey; sections: SectionDef[] }[] = [
  {
    label: "settings.group.workspace",
    sections: [
      { id: "workspace", label: "settings.section.workspace", icon: BuildingIcon },
      { id: "members", label: "settings.section.members", icon: UsersIcon },
    ],
  },
  {
    label: "settings.group.account",
    sections: [
      { id: "profile", label: "settings.section.profile", icon: UserIcon },
      { id: "security", label: "settings.section.security", icon: ShieldIcon },
      { id: "notifications", label: "settings.section.notifications", icon: MailIcon },
      { id: "accounts", label: "settings.section.accounts", icon: UserPlusIcon },
    ],
  },
  {
    label: "settings.group.preferences",
    sections: [
      { id: "appearance", label: "settings.section.appearance", icon: PaletteIcon },
      { id: "language", label: "settings.section.language", icon: GlobeIcon },
      { id: "editor", label: "settings.section.editor", icon: EditIcon },
      { id: "categories", label: "settings.section.categories", icon: TagIcon },
      { id: "ai", label: "settings.section.ai", icon: SparkleIcon },
    ],
  },
  {
    label: "settings.group.app",
    sections: [
      { id: "data", label: "settings.section.data", icon: DatabaseIcon },
      { id: "app", label: "settings.section.app", icon: DownloadIcon },
      { id: "shortcuts", label: "settings.section.shortcuts", icon: KeyboardIcon },
      { id: "danger", label: "settings.section.danger", icon: AlertIcon },
    ],
  },
];
const SECTIONS = GROUPS.flatMap((group) => group.sections);

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="card settings-card">
      <h2 className="card-title">{title}</h2>
      {description && <p className="muted small">{description}</p>}
      <div className="settings-card-body">{children}</div>
    </section>
  );
}

export function SettingsPage({ user, onAddAccount }: { user: User; onAddAccount: () => void }) {
  const { t } = useI18n();
  const { section } = useParams();
  if (section && !SECTIONS.some((item) => item.id === section)) return <Navigate to="/settings" replace />;
  const active = (section ?? "profile") as SectionId;
  const activeSection = SECTIONS.find((item) => item.id === active) ?? SECTIONS[0];
  const ActiveIcon = activeSection.icon;

  return (
    <section aria-labelledby="page-title" className="settings">
      <PageHeader
        title={<span id="page-title">{t("nav.settings")}</span>}
        subtitle={t("settings.subtitle")}
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("nav.settings")}>
          {GROUPS.map((group) => (
            <div key={group.label} className="settings-nav-group">
              <p className="settings-nav-heading">{t(group.label)}</p>
              {group.sections.map(({ id, label, icon: SectionIcon }) => (
                <NavLink
                  key={id}
                  to={`/settings/${id}`}
                  className={id === active ? "settings-nav-item active" : "settings-nav-item"}
                  data-tone={id === "danger" ? "danger" : undefined}
                >
                  <SectionIcon />
                  <span>{t(label)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="settings-panel">
          <h2 className="settings-panel-title">
            <ActiveIcon />
            {t(activeSection.label)}
          </h2>
          {active === "workspace" && <WorkspaceSection user={user} />}
          {active === "members" && <MembersSection />}
          {active === "notifications" && <NotificationsSection user={user} />}
          {active === "editor" && <EditorSection />}
          {active === "profile" && <ProfileSection key={user.id} user={user} />}
          {active === "appearance" && <AppearanceSection user={user} />}
          {active === "language" && <LanguageSection user={user} />}
          {active === "categories" && <CategoriesSection />}
          {active === "accounts" && <AccountsSection user={user} onAddAccount={onAddAccount} />}
          {active === "ai" && <AiSection />}
          {active === "security" && <SecuritySection />}
          {active === "data" && <DataSection />}
          {active === "app" && <AppSection />}
          {active === "shortcuts" && <ShortcutsSection />}
          {active === "danger" && <DangerSection user={user} />}
        </div>
      </div>
    </section>
  );
}

function NotificationsSection({ user }: { user: User }) {
  const { t } = useI18n();
  const updateUser = useUpdateUser(user);
  return (
    <Card title={t("settings.emailNotifications")} description={t("settings.emailNotificationsHint")}>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={user.email_notifications}
          onChange={(event) => void updateUser({ email_notifications: event.target.checked })}
        />
        <span>
          <strong>{t("settings.emailShares")}</strong>
          <span className="hint">{t("settings.emailSharesHint")}</span>
        </span>
      </label>
      <p className="hint">{t("settings.emailAlways")}</p>
    </Card>
  );
}

const FONT_LABELS: Record<number, TranslationKey> = {
  0.9: "settings.fontScale.small",
  1: "settings.fontScale.normal",
  1.1: "settings.fontScale.large",
  1.2: "settings.fontScale.larger",
};

function AppearanceSection({ user }: { user: User }) {
  const { t } = useI18n();
  const updateUser = useUpdateUser(user);
  const [view, setView] = useLocalStorage<ViewMode>("notes.viewMode", "grid");
  const [scale, setScale] = useFontScale();
  return (
    <>
      <Card title={t("settings.theme")} description={t("settings.themeHint")}>
        <ThemeSwitch theme={user.theme} onChange={(theme) => void updateUser({ theme })} size="large" />
      </Card>
      <Card title={t("settings.accent")} description={t("settings.accentHint")}>
        <ColorPicker
          label={t("settings.accent")}
          value={user.accent_color}
          onChange={(accent_color) => void updateUser({ accent_color })}
        />
      </Card>
      <Card title={t("settings.fontSize")} description={t("settings.fontSizeHint")}>
        <div className="segmented font-scale" role="group" aria-label={t("settings.fontSize")}>
          {FONT_SCALES.map((value) => (
            <button key={value} type="button" aria-pressed={scale === value} onClick={() => setScale(value)}>
              <span style={{ fontSize: `${value}em` }}>{t(FONT_LABELS[value])}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card title={t("settings.notesLayout")}>
        <div className="segmented" role="group" aria-label={t("settings.notesLayout")}>
          <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
            {t("notes.grid")}
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
            {t("notes.list")}
          </button>
        </div>
      </Card>
    </>
  );
}

function LanguageSection({ user }: { user: User }) {
  const { t } = useI18n();
  const updateUser = useUpdateUser(user);
  return (
    <Card title={t("settings.section.language")} description={t("settings.languageHint")}>
      <div className="language-options" role="radiogroup" aria-label={t("settings.section.language")}>
        {LANGUAGES.map((language) => (
          <button
            key={language.code}
            type="button"
            role="radio"
            aria-checked={user.language === language.code}
            className="language-option"
            lang={language.code}
            dir={language.dir}
            onClick={() => void updateUser({ language: language.code })}
          >
            <strong>{language.label}</strong>
            <span className="muted small">{t(`settings.languageDetail.${language.code}`)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function CategoryRow({ category, onEdit }: { category: Category; onEdit: () => void }) {
  const i18n = useI18n();
  const { t, plural } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  async function remove() {
    const ok = await confirm({
      title: t("categories.deleteTitle", { name: category.name }),
      message: t("categories.deleteMessage"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await categoriesApi.remove(category.id);
      await client.invalidateQueries({ queryKey: queryKeys.categories });
      client.invalidateQueries({ queryKey: queryKeys.allNotes });
      client.invalidateQueries({ queryKey: queryKeys.tasks });
      toast(t("categories.deleted"));
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  return (
    <li className="category-row" style={categoryStyle(category.color)}>
      <span className="category-row-icon" aria-hidden="true">
        {category.icon || <span className="cat-dot" />}
      </span>
      <span className="menu-item-text">
        <strong dir="auto">{category.name}</strong>
        <span className="muted small">
          {plural("notes.count", category.note_count)} · {plural("tasks.count", category.open_task_count)}
        </span>
      </span>
      <button
        type="button"
        className="icon-button small"
        onClick={onEdit}
        aria-label={t("categories.editNamed", { name: category.name })}
        title={t("common.edit")}
      >
        <EditIcon />
      </button>
      <button
        type="button"
        className="icon-button small danger"
        onClick={() => void remove()}
        aria-label={t("categories.delete", { name: category.name })}
        title={t("common.delete")}
      >
        <TrashIcon />
      </button>
    </li>
  );
}

function CategoriesSection() {
  const { t } = useI18n();
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  return (
    <section className="card settings-card">
      <div className="card-header">
        <div>
          <h2 className="card-title">{t("settings.section.categories")}</h2>
          <p className="muted small">{t("categories.hint")}</p>
        </div>
        <button type="button" className="primary small" onClick={() => setEditing("new")}>
          <PlusIcon /> {t("categories.new")}
        </button>
      </div>
      <ul className="category-rows">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} onEdit={() => setEditing(category)} />
        ))}
      </ul>
      {editing && (
        <CategoryDialog category={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function AccountsSection({ user, onAddAccount }: { user: User; onAddAccount: () => void }) {
  const { t } = useI18n();
  const { accounts } = useAccounts();
  const signOut = async (userId: number, token: string) => {
    await authApi.logout(token).catch(() => undefined);
    accountStore.signOut(userId);
  };
  return (
    <Card title={t("settings.section.accounts")} description={t("settings.accountsHint")}>
      <ul className="account-list">
        {accounts.map((account) => (
          <li key={account.user.id} className="account-row">
            <Avatar user={account.user} size="sm" />
            <span className="menu-item-text">
              <span dir="auto">{displayName(account.user)}</span>
              <span className="muted small">{account.user.email}</span>
            </span>
            {account.user.id === user.id ? (
              <span className="badge">{t("account.active")}</span>
            ) : (
              <button type="button" className="small" onClick={() => accountStore.switchTo(account.user.id)}>
                {t("account.switchTo")}
              </button>
            )}
            <button
              type="button"
              className="ghost small"
              onClick={() => void signOut(account.user.id, account.token)}
            >
              {t("account.signOut")}
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" onClick={onAddAccount}>
          <UserPlusIcon /> {t("account.add")}
        </button>
      </div>
    </Card>
  );
}

function AiSection() {
  const { t, language } = useI18n();
  const { data: status, isLoading } = useAiStatus();
  const [target, setTarget] = useLocalStorage<string>(LANGUAGE_KEY, language === "fa" ? "en" : "fa");
  const [thorough, setThorough] = useLocalStorage("notes.aiThorough", false);
  return (
    <>
      <Card title={t("settings.aiStatus")}>
        <p className="ai-line">
          <span className="status-dot" data-ok={status?.model_available ?? false} />
          {isLoading
            ? t("common.loading")
            : status?.model_available
              ? t("settings.aiReady", { model: status.model })
              : status?.ollama_reachable
                ? t("errors.model_not_found", { model: status.model })
                : t("errors.ollama_unavailable")}
        </p>
      </Card>
      <Card title={t("settings.aiPreferences")}>
        <label className="form-field">
          <span className="field-label">{t("settings.translateDefault")}</span>
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            {TRANSLATION_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.native} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={thorough} onChange={(event) => setThorough(event.target.checked)} />
          <span>{t("settings.thoroughDefault")}</span>
        </label>
        <p className="hint">{t("settings.thoroughHint")}</p>
      </Card>
    </>
  );
}

function AppSection() {
  const { t } = useI18n();
  const { installed, canInstall, install } = useInstallPrompt();
  return (
    <Card title={t("settings.install")} description={t("settings.installHint")}>
      {installed ? (
        <p className="ai-line">
          <span className="status-dot" data-ok="true" /> {t("settings.installed")}
        </p>
      ) : canInstall ? (
        <div>
          <button type="button" className="primary" onClick={() => void install()}>
            <DownloadIcon /> {t("settings.installButton")}
          </button>
        </div>
      ) : (
        <p className="hint">{t("settings.installManual")}</p>
      )}
      <p className="hint app-version">{t("settings.version", { version: APP_VERSION })}</p>
    </Card>
  );
}

const SHORTCUTS: [string, TranslationKey][] = [
  ["/", "shortcuts.search"],
  ["N", "shortcuts.newNote"],
  ["T", "shortcuts.newTask"],
  ["Q", "shortcuts.quickAdd"],
  ["/ (editor)", "shortcuts.slash"],
  ["Ctrl + B / I / U", "shortcuts.format"],
  ["Esc", "shortcuts.close"],
];

function ShortcutsSection() {
  const { t } = useI18n();
  return (
    <Card title={t("settings.section.shortcuts")}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={keys}>
            <dt>
              <kbd dir="ltr">{keys}</kbd>
            </dt>
            <dd>{t(label)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function DangerSection({ user }: { user: User }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await confirm({
      title: t("settings.deleteAccountTitle"),
      message: t("settings.deleteAccountMessage", { email: user.email }),
      confirmLabel: t("settings.deleteAccount"),
      danger: true,
    });
    if (!ok) return;
    try {
      await authApi.deleteAccount(password);
      accountStore.signOut(user.id);
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  return (
    <section className="card settings-card danger-card">
      <h2 className="card-title">{t("settings.deleteAccount")}</h2>
      <p className="muted small">{t("settings.deleteAccountHint")}</p>
      <form className="stack settings-card-body" onSubmit={submit}>
        <label className="form-field">
          <span className="field-label">{t("settings.confirmPassword")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <div>
          <button type="submit" className="danger-solid" disabled={!password}>
            {t("settings.deleteAccount")}
          </button>
        </div>
      </form>
    </section>
  );
}
