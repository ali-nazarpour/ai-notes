/** Password change and the list of signed-in devices. */
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { authApi } from "../../api/endpoints";
import { queryKeys, useSessions } from "../../api/queries";
import { useConfirm, useToast } from "../../components/Feedback";
import { DevicesIcon, LogOutIcon } from "../../components/Icons";
import { Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { passwordStrength } from "../../lib/passwords";
import type { Session } from "../../types";

/** "Chrome on Windows" from a user-agent string (best effort). */
export function describeDevice(agent: string): string {
  if (!agent) return "";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\//.test(agent)
      ? "Opera"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Chrome\//.test(agent)
          ? "Chrome"
          : /Safari\//.test(agent)
            ? "Safari"
            : /python|httpx|curl/i.test(agent)
              ? "API client"
              : "";
  const os = /Windows/.test(agent)
    ? "Windows"
    : /Android/.test(agent)
      ? "Android"
      : /iPhone|iPad/.test(agent)
        ? "iOS"
        : /Mac OS X/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  return [browser, os].filter(Boolean).join(" · ");
}

function SessionRow({ session }: { session: Session }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const device = describeDevice(session.user_agent) || t("security.unknownDevice");

  async function revoke() {
    try {
      await authApi.revokeSession(session.id);
      await client.invalidateQueries({ queryKey: queryKeys.sessions });
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  return (
    <li className="session-row">
      <span className="session-icon">
        <DevicesIcon />
      </span>
      <span className="menu-item-text">
        <span>
          {device} {session.current && <span className="badge">{t("security.thisDevice")}</span>}
        </span>
        <span className="muted small">
          {t("security.lastActive", { date: calendar.dateTime(session.last_used_at ?? session.created_at) })}
        </span>
      </span>
      {!session.current && (
        <button type="button" className="ghost small" onClick={() => void revoke()}>
          <LogOutIcon /> {t("security.signOutDevice")}
        </button>
      )}
    </li>
  );
}

export function SecuritySection() {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const { data: sessions, isLoading } = useSessions();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(next);
  const mismatch = repeat.length > 0 && repeat !== next;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      await client.invalidateQueries({ queryKey: queryKeys.sessions });
      toast(t("settings.passwordChanged"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    } finally {
      setBusy(false);
    }
  }

  async function revokeOthers() {
    const ok = await confirm({
      title: t("security.signOutOthers"),
      message: t("security.signOutOthersMessage"),
      confirmLabel: t("security.signOutOthers"),
      danger: true,
    });
    if (!ok) return;
    try {
      await authApi.revokeOtherSessions();
      await client.invalidateQueries({ queryKey: queryKeys.sessions });
      toast(t("security.signedOutOthers"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  return (
    <>
      <section className="card settings-card">
        <h2 className="card-title">{t("settings.password")}</h2>
        <p className="muted small">{t("settings.passwordHint")}</p>
        <form className="form-grid settings-card-body" onSubmit={submit}>
          <label className="form-field form-field-wide">
            <span className="field-label">{t("settings.currentPassword")}</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span className="field-label">{t("settings.newPassword")}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            {next && (
              <span className="strength" data-level={strength.level}>
                <span className="strength-bar">
                  <span style={{ width: `${(strength.level + 1) * 20}%` }} />
                </span>
                {t(`strength.${strength.level}`)}
              </span>
            )}
          </label>
          <label className="form-field">
            <span className="field-label">{t("security.repeatPassword")}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              aria-invalid={mismatch}
              onChange={(event) => setRepeat(event.target.value)}
            />
            {mismatch && <span className="error-hint">{t("security.mismatch")}</span>}
          </label>
          <div className="form-field-wide">
            <button type="submit" className="primary" disabled={busy || mismatch || next.length < 8}>
              {busy ? t("common.saving") : t("settings.changePassword")}
            </button>
          </div>
        </form>
      </section>

      <section className="card settings-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t("security.sessions")}</h2>
            <p className="muted small">{t("security.sessionsHint")}</p>
          </div>
        </div>
        {isLoading ? (
          <Skeleton rows={2} height={56} />
        ) : (
          <ul className="session-list">
            {sessions?.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        )}
        {(sessions?.length ?? 0) > 1 && (
          <div className="card-footer">
            <button type="button" className="ghost danger" onClick={() => void revokeOthers()}>
              <LogOutIcon /> {t("security.signOutOthers")}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
