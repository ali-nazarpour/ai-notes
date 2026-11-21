/** /reset-password?token=…: choose a new password from the emailed link. */
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

import { accountApi } from "../../api/v4";
import { CheckCircleIcon, EyeIcon, KeyIcon } from "../../components/Icons";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { StrengthMeter } from "../vault/PasswordGenerator";

export function ResetPasswordPage() {
  const i18n = useI18n();
  const { t } = i18n;
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== repeat) {
      setError(t("security.mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await accountApi.reset(token, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-shell">
      <div className="auth-card public-card">
        <span className="brand-mark brand-mark-lg" aria-hidden="true">
          <KeyIcon />
        </span>
        {done ? (
          <div className="auth-sent">
            <CheckCircleIcon />
            <h1>{t("reset.done")}</h1>
            <p className="muted">{t("reset.doneHint")}</p>
            <Link to="/" className="button primary">
              {t("auth.signIn")}
            </Link>
          </div>
        ) : !token ? (
          <p className="error-text">{t("errors.reset_link_invalid")}</p>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <h1>{t("reset.title")}</h1>
            <p className="muted">{t("reset.hint")}</p>
            <label htmlFor="reset-password">{t("security.newPassword")}</label>
            <div className="password-field">
              <input
                id="reset-password"
                type={show ? "text" : "password"}
                dir="ltr"
                autoComplete="new-password"
                minLength={8}
                required
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="icon-button small"
                onClick={() => setShow(!show)}
                aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                <EyeIcon off={show} />
              </button>
            </div>
            <StrengthMeter password={password} />
            <label htmlFor="reset-repeat">{t("security.repeatPassword")}</label>
            <input
              id="reset-repeat"
              type={show ? "text" : "password"}
              dir="ltr"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary block" disabled={busy || password.length < 8}>
              {busy ? t("common.pleaseWait") : t("reset.save")}
            </button>
            <Link to="/" className="button ghost block">
              {t("auth.backToLogin")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
