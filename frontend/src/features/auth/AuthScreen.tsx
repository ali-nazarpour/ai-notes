/** Sign in, create an account (also from an invitation) and "forgot password". */
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { authApi } from "../../api/endpoints";
import { accountApi } from "../../api/v4";
import {
  BackIcon,
  CalendarIcon,
  CheckCircleIcon,
  EyeIcon,
  MailIcon,
  NotesIcon,
  SparkleIcon,
  UserPlusIcon,
} from "../../components/Icons";
import { Avatar, displayName } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { accountStore } from "../../store/accounts";
import type { SavedAccount } from "../../types";
import type { PublicConfig } from "../../types4";

type Mode = "login" | "register" | "forgot";

export interface InviteInfo {
  token: string;
  email: string;
  workspaceName: string;
}

interface AuthScreenProps {
  accounts: SavedAccount[];
  onCancel?: () => void;
  onDone: () => void;
  invite?: InviteInfo;
  initialMode?: "login" | "register";
}

export function AuthScreen({ accounts, onCancel, onDone, invite, initialMode }: AuthScreenProps) {
  const i18n = useI18n();
  const { t, language } = i18n;
  const [selectedMode, setMode] = useState<Mode>(
    invite ? "register" : (initialMode ?? (onCancel || accounts.length ? "login" : "register")),
  );
  const [email, setEmail] = useState(invite?.email ?? "");
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    accountApi.config().then(setConfig, () => setConfig(null));
  }, []);
  const canRegister = config?.allow_registration !== false || Boolean(invite);
  const mode = selectedMode === "register" && !canRegister ? "login" : selectedMode;
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        await accountApi.forgot(email);
        setSent(true);
        setBusy(false);
        return;
      }
      const result =
        mode === "login"
          ? await authApi.login(email, password)
          : await accountApi.register(email, password, name, language, invite?.token);
      accountStore.signIn({ token: result.token, user: result.user });
      onDone();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSent(false);
  };

  return (
    <div className="auth">
      <section className="auth-hero" aria-hidden="true">
        <span className="brand-mark brand-mark-lg">N</span>
        <h2>{t("auth.heroTitle")}</h2>
        <ul className="auth-features">
          <li>
            <NotesIcon /> {t("auth.feature.notes")}
          </li>
          <li>
            <CheckCircleIcon /> {t("auth.feature.tasks")}
          </li>
          <li>
            <CalendarIcon /> {t("auth.feature.calendar")}
          </li>
          <li>
            <SparkleIcon /> {t("auth.feature.ai")}
          </li>
        </ul>
      </section>

      <section className="auth-card" data-mode={mode}>
        {(onCancel || initialMode) && (
          <div className="auth-top">
            {onCancel ? (
              <button type="button" className="ghost small" onClick={onCancel}>
                <BackIcon /> {t("common.back")}
              </button>
            ) : (
              <Link className="with-icon" to="/">
                <BackIcon /> {t("app.name")}
              </Link>
            )}
          </div>
        )}
        {invite && (
          <div className="auth-invite">
            <UserPlusIcon />
            <span>{t("invite.joinTitle", { name: invite.workspaceName })}</span>
          </div>
        )}
        <h1>
          {mode === "forgot"
            ? t("auth.forgotTitle")
            : mode === "login"
              ? t("auth.welcomeBack")
              : t("auth.createTitle")}
        </h1>
        <p className="muted">
          {mode === "forgot"
            ? t("auth.forgotHint")
            : mode === "login"
              ? t("auth.loginHint")
              : t("auth.registerHint")}
        </p>

        {mode === "forgot" ? (
          sent ? (
            <div className="auth-sent" role="status">
              <MailIcon />
              <p>{t("auth.resetSent")}</p>
              {config && !config.email_enabled && <p className="hint">{t("auth.emailOff")}</p>}
              <button type="button" className="ghost" onClick={() => switchMode("login")}>
                <BackIcon /> {t("auth.backToLogin")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="auth-form">
              <label htmlFor="auth-email">{t("auth.email")}</label>
              <input
                id="auth-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
              />
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="primary block" disabled={busy}>
                {busy ? t("common.pleaseWait") : t("auth.sendResetLink")}
              </button>
              <button type="button" className="ghost block" onClick={() => switchMode("login")}>
                <BackIcon /> {t("auth.backToLogin")}
              </button>
            </form>
          )
        ) : (
          <>
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => switchMode("login")}
              >
                {t("auth.signIn")}
              </button>
              {canRegister && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  onClick={() => switchMode("register")}
                >
                  {t("auth.createAccount")}
                </button>
              )}
            </div>
            {!canRegister && <p className="hint">{t("auth.registrationClosed")}</p>}

            <form onSubmit={submit} className="auth-form">
              {mode === "register" && (
                <>
                  <label htmlFor="auth-name">{t("auth.name")}</label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </>
              )}
              <label htmlFor="auth-email">{t("auth.email")}</label>
              <input
                id="auth-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
              />
              <label htmlFor="auth-password">{t("auth.password")}</label>
              <div className="password-field">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 8 : 1}
                  aria-describedby={mode === "register" ? "auth-password-hint" : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="icon-button small"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
              {mode === "register" && (
                <p id="auth-password-hint" className="hint">
                  {t("auth.passwordRule")}
                </p>
              )}
              {mode === "login" && (
                <button
                  type="button"
                  className="link-button forgot-link"
                  onClick={() => switchMode("forgot")}
                >
                  {t("auth.forgot")}
                </button>
              )}
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="primary block" disabled={busy}>
                {busy
                  ? t("common.pleaseWait")
                  : mode === "login"
                    ? t("auth.signIn")
                    : t("auth.createAccount")}
              </button>
            </form>
          </>
        )}

        {accounts.length > 0 && onCancel && (
          <div className="auth-accounts">
            <p className="sidebar-heading">{t("auth.signedInHere")}</p>
            {accounts.map((account) => (
              <button
                key={account.user.id}
                type="button"
                className="menu-item"
                onClick={() => {
                  accountStore.switchTo(account.user.id);
                  onDone();
                }}
              >
                <Avatar user={account.user} size="sm" />
                <span className="menu-item-text">
                  <span>{displayName(account.user)}</span>
                  <span className="muted small">{account.user.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
