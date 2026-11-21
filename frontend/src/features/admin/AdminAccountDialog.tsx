import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { adminApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import {
  CopyIcon,
  KeyIcon,
  LogOutIcon,
  ShieldUserIcon,
  TrashIcon,
  UserPlusIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/ui";
import { LANGUAGES, useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { formatBytes } from "../../lib/embeds";
import type { Language } from "../../types";
import type { AdminUserDetails } from "../../types4";

type AccountInput = Parameters<typeof adminApi.createUser>[0];

function useRefreshAccounts() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin-users"] }),
      client.invalidateQueries({ queryKey: ["admin-stats"] }),
      client.invalidateQueries({ queryKey: ["admin-workspaces"] }),
    ]);
  };
}

function AccountForm({
  user,
  onSave,
  onCancel,
}: {
  user?: AdminUserDetails;
  onSave: (body: AccountInput) => Promise<void>;
  onCancel: () => void;
}) {
  const i18n = useI18n();
  const { t, language } = i18n;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        email: String(form.get("email") ?? ""),
        display_name: String(form.get("display_name") ?? ""),
        language: form.get("language") as Language,
        password: String(form.get("password") ?? ""),
        is_admin: form.has("is_admin"),
      });
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack admin-account-form" onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">{t("auth.name")}</span>
          <input
            name="display_name"
            defaultValue={user?.display_name}
            maxLength={80}
            autoComplete="off"
            dir="auto"
          />
        </label>
        <label className="field">
          <span className="field-label">{t("auth.email")}</span>
          <input
            name="email"
            type="email"
            dir="ltr"
            required
            defaultValue={user?.email}
            maxLength={254}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">{t("settings.section.language")}</span>
          <select name="language" defaultValue={user?.language ?? language}>
            {LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {!user && (
          <label className="field">
            <span className="field-label">{t("admin.initialPassword")}</span>
            <input
              name="password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <span className="hint">{t("admin.initialPasswordHint")}</span>
          </label>
        )}
      </div>
      {user ? (
        <p className="muted small">{t("admin.emailChangeHint")}</p>
      ) : (
        <label className="toggle-row">
          <input name="is_admin" type="checkbox" />
          {t("admin.makeAdmin")}
        </label>
      )}
      {error && (
        <div role="alert" className="admin-account-error">
          {error}
        </div>
      )}
      <div className="row-end">
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {t(busy ? "common.loading" : user ? "common.save" : "admin.createUser")}
        </button>
      </div>
    </form>
  );
}

export function CreateAccountDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const refresh = useRefreshAccounts();

  return (
    <Modal title={t("admin.createUser")} icon={UserPlusIcon} onClose={onClose}>
      <AccountForm
        onCancel={onClose}
        onSave={async (body) => {
          const user = await adminApi.createUser(body);
          void refresh();
          toast(t("admin.userCreated"), "success");
          onCreated(user.id);
        }}
      />
    </Modal>
  );
}

type AccountAction = { label: string; run: () => Promise<void>; danger?: boolean; description?: string };

export function AccountDialog({ id, isSelf, onClose }: { id: number; isSelf: boolean; onClose: () => void }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const refresh = useRefreshAccounts();
  const query = useQuery({ queryKey: ["admin-user", id], queryFn: () => adminApi.user(id) });
  const user = query.data;
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<AccountAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");

  async function changed(message: string) {
    toast(message, "success");
    await Promise.all([refresh(), query.refetch()]);
  }

  async function confirmAction() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await pending.run();
      setPending(null);
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setBusy(true);
    try {
      const result = await adminApi.resetLink(id);
      setLink(result.link);
      const status = result.email_status;
      toast(
        t(
          status === "failed"
            ? "admin.resetMailFailed"
            : status === "sent"
              ? "admin.resetSent"
              : "admin.resetCopy",
        ),
        status === "failed" ? "error" : "success",
      );
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setBusy(false);
    }
  }

  function revoke(sessionId?: number) {
    setPending({
      label: t(sessionId === undefined ? "admin.signOutAll" : "admin.signOutSession"),
      run: async () => {
        await adminApi.revokeSessions(id, sessionId);
        await changed(t("admin.sessionsRevoked"));
      },
    });
  }

  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      title={user && !editing ? <bdi>{user.name}</bdi> : t(editing ? "admin.editUser" : "admin.user")}
      icon={ShieldUserIcon}
      onClose={close}
      size="lg"
      className="admin-account-modal"
    >
      {query.isError && (
        <div className="admin-account-error" role="alert">
          {errorMessage(query.error, i18n)}{" "}
          <button type="button" className="ghost small" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {query.isPending && <Skeleton rows={4} />}
      {user &&
        (editing ? (
          <AccountForm
            user={user}
            onCancel={() => setEditing(false)}
            onSave={async ({ email, display_name, language }) => {
              await adminApi.updateUser(id, { email, display_name, language });
              setLink("");
              await changed(t("admin.userUpdated"));
              setEditing(false);
            }}
          />
        ) : (
          <div className="stack admin-account-details">
            <div className="admin-account-summary">
              <div>
                <bdi>{user.email}</bdi>
                <div className="muted small">
                  {t("admin.registered")} · {calendar.dateTime(user.created_at)}
                </div>
              </div>
              <div className="admin-directory-badges">
                <span className="admin-account-badge" data-active={user.is_active}>
                  {t(user.is_active ? "admin.enabled" : "admin.disabled")}
                </span>
                <span className={user.is_admin ? "badge accent" : "badge"}>
                  {t(user.is_admin ? "admin.isAdmin" : "admin.isUser")}
                </span>
              </div>
            </div>
            <dl className="admin-detail-metrics">
              <div>
                <dt>{t("nav.notes")}</dt>
                <dd>{calendar.formatNumber(user.notes)}</dd>
              </div>
              <div>
                <dt>{t("admin.stat.workspaces")}</dt>
                <dd>{calendar.formatNumber(user.workspaces)}</dd>
              </div>
              <div>
                <dt>{t("admin.stat.storage")}</dt>
                <dd>{formatBytes(user.storage_bytes, calendar.formatNumber)}</dd>
              </div>
            </dl>
            {!isSelf && (
              <div className="admin-account-actions">
                <button
                  type="button"
                  className="small"
                  onClick={() => setEditing(true)}
                  disabled={busy || Boolean(pending)}
                >
                  {t("admin.editUser")}
                </button>
                <button
                  type="button"
                  className="small"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    setPending({
                      label: t(user.is_admin ? "admin.removeAdmin" : "admin.makeAdmin"),
                      run: async () => {
                        await adminApi.updateUser(id, { is_admin: !user.is_admin });
                        await changed(t("admin.userUpdated"));
                      },
                    })
                  }
                >
                  {t(user.is_admin ? "admin.removeAdmin" : "admin.makeAdmin")}
                </button>
                <button
                  type="button"
                  className="small"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    setPending({
                      label: t(user.is_active ? "admin.disable" : "admin.enable"),
                      danger: user.is_active,
                      run: async () => {
                        await adminApi.updateUser(id, { is_active: !user.is_active });
                        await changed(t("admin.userUpdated"));
                      },
                    })
                  }
                >
                  {t(user.is_active ? "admin.disable" : "admin.enable")}
                </button>
                <button
                  type="button"
                  className="small"
                  onClick={() => void resetPassword()}
                  disabled={busy || Boolean(pending)}
                >
                  <KeyIcon /> {t("admin.resetLink")}
                </button>
                <button
                  type="button"
                  className="small danger"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    setPending({
                      label: t("admin.deleteUser"),
                      danger: true,
                      description: t("admin.deleteUserMessage", { email: user.email }),
                      run: async () => {
                        await adminApi.removeUser(id);
                        onClose();
                        void refresh();
                        toast(t("admin.userDeleted"), "success");
                      },
                    })
                  }
                >
                  <TrashIcon /> {t("admin.deleteUser")}
                </button>
              </div>
            )}
            {pending && (
              <div className="admin-account-confirm">
                <p>
                  {pending.description ??
                    t("admin.confirmAccountAction", { action: pending.label, email: user.email })}
                </p>
                <div className="row-end">
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => setPending(null)}
                    disabled={busy}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className={`${pending.danger ? "danger" : "primary"} small`}
                    onClick={() => void confirmAction()}
                    disabled={busy}
                  >
                    {pending.label}
                  </button>
                </div>
              </div>
            )}
            {link && (
              <div className="admin-reset-link">
                <input
                  readOnly
                  value={link}
                  dir="ltr"
                  aria-label={t("admin.resetLink")}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="small"
                  onClick={() =>
                    void navigator.clipboard.writeText(link).then(
                      () => toast(t("common.copied"), "success"),
                      (err: unknown) => toast(errorMessage(err, i18n), "error"),
                    )
                  }
                >
                  <CopyIcon /> {t("common.copy")}
                </button>
              </div>
            )}
            <section className="admin-account-section">
              <div className="admin-account-section-heading">
                <h3>{t("admin.sessions")}</h3>
                {!isSelf && user.sessions.length > 0 && (
                  <button
                    type="button"
                    className="ghost small"
                    disabled={busy || Boolean(pending)}
                    onClick={() => revoke()}
                  >
                    <LogOutIcon /> {t("admin.signOutAll")}
                  </button>
                )}
              </div>
              {user.sessions.length ? (
                <ul>
                  {user.sessions.map((session) => (
                    <li key={session.id}>
                      <div>
                        <bdi>{session.user_agent || t("admin.deviceUnknown")}</bdi>
                        <div className="small muted">
                          {calendar.dateTime(session.last_used_at ?? session.created_at)}
                        </div>
                      </div>
                      {!isSelf && (
                        <button
                          type="button"
                          className="ghost small"
                          disabled={busy || Boolean(pending)}
                          onClick={() => revoke(session.id)}
                        >
                          {t("admin.signOutSession")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{t("admin.noSessions")}</p>
              )}
            </section>
            <section className="admin-account-section">
              <h3>{t("admin.memberships")}</h3>
              {user.memberships.length ? (
                <ul>
                  {user.memberships.map((space) => (
                    <li key={space.id}>
                      <bdi>{space.name}</bdi>
                      <span className="badge">{t(`role.${space.role}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{t("admin.noMemberships")}</p>
              )}
            </section>
          </div>
        ))}
    </Modal>
  );
}
