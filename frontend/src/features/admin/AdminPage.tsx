/**
 * Admin panel (admins only): overview, users, email service (Gmail SMTP), general
 * settings and the email log.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, NavLink, useParams } from "react-router";

import { adminApi } from "../../api/v4";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  AlertIcon,
  BrainIcon,
  CheckCircleIcon,
  CopyIcon,
  DatabaseIcon,
  DriveIcon,
  EyeIcon,
  type IconComponent,
  InboxIcon,
  KeyIcon,
  MailIcon,
  SendIcon,
  SettingsIcon,
  ShieldUserIcon,
  TrashIcon,
  UsersIcon,
} from "../../components/Icons";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { formatBytes } from "../../lib/embeds";
import { driveApi } from "../../api/v5";
import type { DriveSettings } from "../../types5";
import type { User } from "../../types";
import type { GeneralSettings, SmtpSecurity, SmtpSettings } from "../../types4";

type Section = "overview" | "users" | "email" | "drive" | "general" | "log";

const SECTIONS: { id: Section; label: TranslationKey; icon: IconComponent }[] = [
  { id: "overview", label: "admin.overview", icon: DatabaseIcon },
  { id: "users", label: "admin.users", icon: UsersIcon },
  { id: "email", label: "admin.email", icon: MailIcon },
  { id: "drive", label: "nav.drive", icon: DriveIcon },
  { id: "general", label: "admin.general", icon: SettingsIcon },
  { id: "log", label: "admin.log", icon: InboxIcon },
];

export function AdminPage({ user }: { user: User }) {
  const { t } = useI18n();
  const { section = "overview" } = useParams();
  if (!user.is_admin) return <Navigate to="/" replace />;
  const current = (SECTIONS.find((s) => s.id === section)?.id ?? "overview") as Section;

  return (
    <div className="page admin-page">
      <PageHeader
        title={
          <>
            <ShieldUserIcon /> {t("nav.admin")}
          </>
        }
        subtitle={t("admin.subtitle")}
      />
      <nav className="admin-tabs" aria-label={t("nav.admin")}>
        {SECTIONS.map(({ id, label, icon: TabIcon }) => (
          <NavLink key={id} to={`/admin/${id}`} className={current === id ? "admin-tab active" : "admin-tab"}>
            <TabIcon /> {t(label)}
          </NavLink>
        ))}
      </nav>
      {current === "overview" && <Overview />}
      {current === "users" && <Users me={user} />}
      {current === "email" && <EmailSettings me={user} />}
      {current === "drive" && <DriveLimits />}
      {current === "general" && <General />}
      {current === "log" && <EmailLog />}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: StatIcon,
  tone,
}: {
  label: string;
  value: string;
  icon: IconComponent;
  tone?: string;
}) {
  return (
    <div className="stat-card" data-tone={tone}>
      <span className="stat-icon">
        <StatIcon />
      </span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Overview() {
  const { t, calendar } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: adminApi.stats });
  if (isLoading || !data) return <Skeleton rows={4} />;
  const n = calendar.formatNumber;
  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label={t("admin.stat.users")} value={n(data.users)} icon={UsersIcon} />
        <Stat
          label={t("admin.stat.active")}
          value={n(data.active_users_7d)}
          icon={CheckCircleIcon}
          tone="green"
        />
        <Stat label={t("admin.stat.workspaces")} value={n(data.workspaces)} icon={DatabaseIcon} />
        <Stat
          label={t("admin.stat.storage")}
          value={formatBytes(data.storage_bytes, n)}
          icon={DatabaseIcon}
        />
      </div>
      <div className="stat-grid small-stats">
        {(
          [
            ["nav.notes", data.notes],
            ["nav.tasks", data.tasks],
            ["nav.boards", data.boards],
            ["admin.stat.docPages", data.doc_pages],
            ["nav.blog", data.posts],
            ["nav.projects", data.projects],
            ["admin.stat.files", data.files],
            ["admin.stat.admins", data.admins],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="mini-stat">
            <strong>{n(value)}</strong>
            <span className="muted small">{t(label)}</span>
          </div>
        ))}
      </div>
      <div className="health-grid">
        <div className="card health-card" data-ok={data.email_enabled}>
          <MailIcon />
          <div>
            <strong>{t("admin.email")}</strong>
            <p className="muted small">
              {data.email_enabled ? t("admin.health.emailOn") : t("admin.health.emailOff")} ·{" "}
              {t("admin.health.emails", { sent: data.emails_sent, failed: data.emails_failed })}
            </p>
          </div>
        </div>
        <div className="card health-card" data-ok={data.ai_reachable && data.ai_model_available}>
          <BrainIcon />
          <div>
            <strong>{t("admin.health.ai")}</strong>
            <p className="muted small" dir="auto">
              {data.ai_model} ·{" "}
              {data.ai_reachable
                ? data.ai_model_available
                  ? t("admin.health.aiOk")
                  : t("admin.health.aiNoModel")
                : t("admin.health.aiDown")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Users({ me }: { me: User }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const search = usePageQuery();
  const [link, setLink] = useState<string | null>(null);
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => adminApi.users(search),
  });

  async function run(action: () => Promise<unknown>, done?: string) {
    try {
      await action();
      if (done) toast(done, "success");
      await client.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  return (
    <div className="stack">
      {link && (
        <div className="card link-card">
          <KeyIcon />
          <code dir="ltr">{link}</code>
          <button
            type="button"
            className="ghost small"
            onClick={() =>
              void navigator.clipboard.writeText(link).then(() => toast(t("common.copied"), "success"))
            }
          >
            <CopyIcon /> {t("common.copy")}
          </button>
        </div>
      )}
      {isLoading ? (
        <Skeleton rows={4} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("admin.user")}</th>
                <th>{t("admin.role")}</th>
                <th className="hide-on-phone">{t("admin.lastActive")}</th>
                <th className="hide-on-phone">{t("admin.usage")}</th>
                <th aria-label={t("common.actions")} />
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} data-disabled={!row.is_active}>
                  <td>
                    <div className="user-cell">
                      <span className="avatar avatar-sm" aria-hidden="true">
                        {row.avatar ? <img src={row.avatar} alt="" /> : row.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{row.name}</strong>
                        <span className="muted small" dir="ltr">
                          {row.email}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={row.is_admin ? "badge accent" : "badge"}>
                      {row.is_admin ? t("admin.isAdmin") : t("admin.isUser")}
                    </span>
                    {!row.is_active && <span className="badge danger">{t("admin.disabled")}</span>}
                  </td>
                  <td className="hide-on-phone muted small">
                    {row.last_active ? calendar.dateTime(row.last_active) : "—"}
                  </td>
                  <td className="hide-on-phone muted small">
                    {t("admin.usageValue", {
                      notes: row.notes,
                      workspaces: row.workspaces,
                      size: formatBytes(row.storage_bytes, calendar.formatNumber),
                    })}
                  </td>
                  <td>
                    {row.id !== me.id && (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            void run(() => adminApi.updateUser(row.id, { is_admin: !row.is_admin }))
                          }
                        >
                          {row.is_admin ? t("admin.removeAdmin") : t("admin.makeAdmin")}
                        </button>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            void run(() => adminApi.updateUser(row.id, { is_active: !row.is_active }))
                          }
                        >
                          {row.is_active ? t("admin.disable") : t("admin.enable")}
                        </button>
                        <button
                          type="button"
                          className="icon-button small"
                          title={t("admin.resetLink")}
                          aria-label={t("admin.resetLink")}
                          onClick={() =>
                            void run(async () => {
                              const result = await adminApi.resetLink(row.id);
                              setLink(result.link);
                              toast(
                                result.email_status === "sent" ? t("admin.resetSent") : t("admin.resetCopy"),
                                result.email_status === "failed" ? "error" : "success",
                              );
                            })
                          }
                        >
                          <KeyIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-button small danger"
                          title={t("admin.deleteUser")}
                          aria-label={t("admin.deleteUser")}
                          onClick={async () => {
                            const ok = await confirm({
                              title: t("admin.deleteUser"),
                              message: t("admin.deleteUserMessage", { email: row.email }),
                              confirmLabel: t("common.delete"),
                              danger: true,
                            });
                            if (ok) await run(() => adminApi.removeUser(row.id), t("admin.userDeleted"));
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const GMAIL: Partial<SmtpSettings> = { host: "smtp.gmail.com", port: 587, security: "starttls" };

function EmailSettings({ me }: { me: User }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-email"], queryFn: adminApi.email });
  const [form, setForm] = useState<SmtpSettings | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testTo, setTestTo] = useState(me.email);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; error: string } | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);
  if (!form) return <Skeleton rows={5} />;

  const set = (patch: Partial<SmtpSettings>) => setForm({ ...form, ...patch });

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { password_set: _ignored, ...rest } = form;
      const saved = await adminApi.saveEmail({
        ...rest,
        password: password ? password.replace(/\s+/g, "") : null,
      });
      setForm(saved);
      setPassword("");
      toast(t("settings.saved"), "success");
      await client.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      await save();
      setResult(await adminApi.testEmail(testTo));
    } catch (err) {
      setResult({ status: "failed", error: errorMessage(err, i18n) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-email">
      <form className="card stack" onSubmit={save}>
        <div className="row-between">
          <h2 className="section-title">
            <MailIcon /> {t("admin.smtp")}
          </h2>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => set({ enabled: event.target.checked })}
            />
            <span>{t("admin.emailEnabled")}</span>
          </label>
        </div>
        <button
          type="button"
          className="preset-button"
          onClick={() =>
            set({
              ...GMAIL,
              username: form.username || me.email,
              from_email: form.from_email || form.username || me.email,
            })
          }
        >
          <span className="preset-logo" aria-hidden="true">
            G
          </span>
          <span>
            <strong>{t("admin.gmailPreset")}</strong>
            <span className="muted small">smtp.gmail.com · 587 · STARTTLS</span>
          </span>
        </button>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t("admin.host")}</span>
            <input dir="ltr" value={form.host} onChange={(event) => set({ host: event.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">{t("admin.port")}</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(event) => set({ port: Number(event.target.value) || 587 })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("admin.security")}</span>
            <select
              value={form.security}
              onChange={(event) => set({ security: event.target.value as SmtpSecurity })}
            >
              <option value="starttls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
              <option value="none">{t("admin.securityNone")}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t("admin.username")}</span>
            <input
              type="email"
              dir="ltr"
              value={form.username}
              onChange={(event) => set({ username: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">
              {t("admin.appPassword")}{" "}
              {form.password_set && <span className="badge">{t("admin.passwordSaved")}</span>}
            </span>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                dir="ltr"
                autoComplete="new-password"
                placeholder={form.password_set ? "••••••••••••••••" : "abcd efgh ijkl mnop"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="icon-button small"
                onClick={() => setShowPassword(!showPassword)}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </label>
          <label className="field">
            <span className="field-label">{t("admin.fromEmail")}</span>
            <input
              type="email"
              dir="ltr"
              value={form.from_email}
              onChange={(event) => set({ from_email: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("admin.fromName")}</span>
            <input value={form.from_name} onChange={(event) => set({ from_name: event.target.value })} />
          </label>
        </div>
        <div className="row-end">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>

      <aside className="stack">
        <div className="card stack">
          <h3 className="section-title">
            <SendIcon /> {t("admin.testTitle")}
          </h3>
          <input type="email" dir="ltr" value={testTo} onChange={(event) => setTestTo(event.target.value)} />
          <button type="button" className="button" disabled={busy || !testTo} onClick={() => void test()}>
            {t("admin.sendTest")}
          </button>
          {result && (
            <p className={result.status === "sent" ? "success-text" : "error-text"} role="status" dir="auto">
              {result.status === "sent" ? t("admin.testSent") : result.error || t("admin.testSkipped")}
            </p>
          )}
        </div>
        <div className="card gmail-help">
          <h3 className="section-title">
            <AlertIcon /> {t("admin.gmailHelpTitle")}
          </h3>
          <ol>
            <li>{t("admin.gmailStep1")}</li>
            <li>{t("admin.gmailStep2")}</li>
            <li>{t("admin.gmailStep3")}</li>
            <li>{t("admin.gmailStep4")}</li>
          </ol>
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="button small"
          >
            myaccount.google.com/apppasswords
          </a>
        </div>
      </aside>
    </div>
  );
}

function General() {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["admin-general"], queryFn: adminApi.general });
  const [form, setForm] = useState<GeneralSettings | null>(null);
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);
  if (!form) return <Skeleton rows={3} />;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      setForm(await adminApi.saveGeneral(form));
      toast(t("settings.saved"), "success");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  return (
    <form className="card stack admin-general" onSubmit={save}>
      <label className="field">
        <span className="field-label">{t("admin.appName")}</span>
        <input
          maxLength={60}
          value={form.app_name}
          onChange={(event) => setForm({ ...form, app_name: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">{t("admin.appUrl")}</span>
        <input
          type="url"
          dir="ltr"
          value={form.app_url}
          onChange={(event) => setForm({ ...form, app_url: event.target.value })}
        />
        <span className="hint">{t("admin.appUrlHint")}</span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={form.allow_registration}
          onChange={(event) => setForm({ ...form, allow_registration: event.target.checked })}
        />
        <span>
          <strong>{t("admin.allowRegistration")}</strong>
          <span className="hint">{t("admin.allowRegistrationHint")}</span>
        </span>
      </label>
      <div className="row-end">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

function EmailLog() {
  const { t, calendar } = useI18n();
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-emails"], queryFn: adminApi.emails });
  if (isLoading) return <Skeleton rows={4} />;
  if (!data.length) return <EmptyState icon={InboxIcon} title={t("admin.logEmpty")} />;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("admin.logWhen")}</th>
            <th>{t("admin.logTo")}</th>
            <th className="hide-on-phone">{t("admin.logSubject")}</th>
            <th>{t("admin.logStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              <td className="small">{calendar.dateTime(row.created_at)}</td>
              <td className="small" dir="ltr">
                {row.to_email}
              </td>
              <td className="hide-on-phone small" dir="auto">
                {row.subject}
              </td>
              <td>
                <span className={`badge status-${row.status}`} title={row.error}>
                  {t(`admin.status.${row.status}`)}
                </span>
                {row.error && (
                  <span className="muted small log-error" dir="ltr">
                    {row.error}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriveLimits() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["admin-drive"], queryFn: driveApi.settings });
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminApi.stats });
  const [form, setForm] = useState<DriveSettings | null>(null);
  const [blocked, setBlocked] = useState("");
  useEffect(() => {
    if (data && !form) {
      setForm(data);
      setBlocked(data.blocked_extensions.join(", "));
    }
  }, [data, form]);
  if (!form) return <Skeleton rows={3} />;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      const saved = await driveApi.saveSettings({
        ...form,
        blocked_extensions: blocked.split(/[\s,،]+/).filter(Boolean),
      });
      setForm(saved);
      setBlocked(saved.blocked_extensions.join(", "));
      toast(t("settings.saved"), "success");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  const presets = ["exe", "msi", "bat", "cmd", "scr", "js", "vbs", "ps1", "apk", "dmg"];
  return (
    <form className="card stack admin-general" onSubmit={save}>
      <div className="admin-drive-head">
        <span className="info-card-icon">
          <DriveIcon />
        </span>
        <div>
          <h2 className="card-title">{t("admin.driveTitle")}</h2>
          <p className="muted small">{t("admin.driveHint")}</p>
        </div>
        {stats && (
          <span className="badge">
            {t("admin.driveUsed", {
              size: formatBytes(stats.drive_bytes ?? 0, calendar.formatNumber),
              files: calendar.formatNumber(stats.drive_files ?? 0),
            })}
          </span>
        )}
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">{t("admin.maxFile")}</span>
          <span className="input-suffix">
            <input
              type="number"
              min={1}
              max={2000}
              value={form.max_file_mb}
              onChange={(event) => setForm({ ...form, max_file_mb: Number(event.target.value) || 1 })}
            />
            <span>MB</span>
          </span>
          <span className="hint">{t("admin.maxFileHint")}</span>
        </label>
        <label className="field">
          <span className="field-label">{t("admin.quota")}</span>
          <span className="input-suffix">
            <input
              type="number"
              min={0}
              value={form.workspace_quota_mb}
              onChange={(event) =>
                setForm({ ...form, workspace_quota_mb: Math.max(0, Number(event.target.value) || 0) })
              }
            />
            <span>MB</span>
          </span>
          <span className="hint">{t("admin.quotaHint")}</span>
        </label>
      </div>
      <label className="field">
        <span className="field-label">{t("admin.blocked")}</span>
        <input
          dir="ltr"
          value={blocked}
          placeholder="exe, bat, msi"
          onChange={(event) => setBlocked(event.target.value)}
        />
        <span className="hint">{t("admin.blockedHint")}</span>
      </label>
      <div className="chips">
        {presets.map((ext) => {
          const list = blocked.split(/[\s,،]+/).filter(Boolean);
          const on = list.includes(ext);
          return (
            <button
              key={ext}
              type="button"
              className="chip"
              aria-pressed={on}
              onClick={() => setBlocked((on ? list.filter((x) => x !== ext) : [...list, ext]).join(", "))}
            >
              .{ext}
            </button>
          );
        })}
      </div>
      <div className="row-end">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
