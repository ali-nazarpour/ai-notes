/**
 * Admin panel (admins only): overview, users, email service (Gmail SMTP), general
 * settings and the email log.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router";

import { adminApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import {
  AlertIcon,
  BrainIcon,
  CheckCircleIcon,
  DatabaseIcon,
  DriveIcon,
  EyeIcon,
  FolderIcon,
  type IconComponent,
  KeyIcon,
  LinkIcon,
  MailIcon,
  SendIcon,
  UsersIcon,
} from "../../components/Icons";
import { PageHeader, Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { formatBytes } from "../../lib/embeds";
import { driveApi } from "../../api/v5";
import type { DriveSettings } from "../../types5";
import type { User } from "../../types";
import type { GeneralSettings, SmtpSecurity, SmtpSettings } from "../../types4";
import { AdminLoadError, AdminUsers, AdminWorkspaces } from "./AdminDirectory";
import { AdminEmailLog } from "./AdminEmailLog";
import { getAdminSection } from "./adminSections";

export function AdminPage({ user }: { user: User }) {
  const { t } = useI18n();
  const { section } = useParams();
  if (!user.is_admin) return <Navigate to="/" replace />;
  const { id: current, label, icon: SectionIcon } = getAdminSection(section);

  return (
    <div className="page admin-page">
      {current !== "users" && current !== "workspaces" && current !== "log" && (
        <PageHeader
          title={
            <>
              <SectionIcon /> {t(label)}
            </>
          }
          subtitle={current === "overview" ? t("admin.subtitle") : undefined}
        />
      )}
      {current === "overview" && <Overview />}
      {current === "users" && <AdminUsers me={user} />}
      {current === "workspaces" && <AdminWorkspaces ownerEmail={user.email} />}
      {current === "email" && <EmailSettings me={user} />}
      {current === "drive" && <DriveLimits />}
      {current === "general" && <General />}
      {current === "log" && <AdminEmailLog />}
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
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: adminApi.stats,
  });
  if (isError) return <AdminLoadError error={error} onRetry={() => void refetch()} />;
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
            ["admin.disabled", data.disabled],
            ["nav.slides", data.decks ?? 0],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="mini-stat">
            <strong>{n(value)}</strong>
            <span className="muted small">{t(label)}</span>
          </div>
        ))}
      </div>
      <nav className="admin-shortcuts" aria-label={t("admin.overviewShortcuts")}>
        <Link to="/users?state=disabled" className="badge">
          <UsersIcon /> {t("admin.disabled")} · {n(data.disabled)}
        </Link>
        <Link to="/workspaces" className="badge">
          <FolderIcon /> {t("admin.stat.workspaces")}
        </Link>
        <Link to="/drive" className="badge">
          <DriveIcon />{" "}
          {t("admin.driveUsed", {
            size: formatBytes(data.drive_bytes ?? 0, n),
            files: n(data.drive_files ?? 0),
          })}
        </Link>
      </nav>
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

const GMAIL: Partial<SmtpSettings> = { host: "smtp.gmail.com", port: 587, security: "starttls" };

function EmailSettings({ me }: { me: User }) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const { data, isError, error, refetch } = useQuery({ queryKey: ["admin-email"], queryFn: adminApi.email });
  const [form, setForm] = useState<SmtpSettings | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testTo, setTestTo] = useState(me.email);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; error: string } | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);
  if (isError && !form) return <AdminLoadError error={error} onRetry={() => void refetch()} />;
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

      <aside className="admin-email-side">
        <form
          className="card admin-email-card"
          aria-labelledby="admin-test-email-title"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void test();
          }}
        >
          <div className="admin-email-card-heading">
            <span className="admin-email-card-icon">
              <SendIcon />
            </span>
            <h3 id="admin-test-email-title">{t("admin.testTitle")}</h3>
          </div>
          <label className="admin-test-recipient">
            <span>{t("admin.testRecipient")}</span>
            <input
              type="email"
              autoComplete="email"
              required
              dir="ltr"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
          </label>
          <button type="submit" className="primary admin-email-test-action" disabled={busy || !testTo.trim()}>
            <SendIcon /> {t("admin.sendTest")}
          </button>
          {result && (
            <div className="admin-email-test-result" data-status={result.status} role="status">
              {result.status === "sent" ? <CheckCircleIcon /> : <AlertIcon />}
              <span dir="auto">
                {result.status === "sent" ? t("admin.testSent") : result.error || t("admin.testSkipped")}
              </span>
            </div>
          )}
        </form>
        <section className="card admin-email-card admin-gmail-help" aria-labelledby="admin-gmail-help-title">
          <div className="admin-email-card-heading">
            <span className="admin-email-card-icon">
              <KeyIcon />
            </span>
            <h3 id="admin-gmail-help-title">{t("admin.gmailHelpTitle")}</h3>
          </div>
          <ol className="admin-gmail-steps" role="list">
            {(["admin.gmailStep1", "admin.gmailStep2", "admin.gmailStep3", "admin.gmailStep4"] as const).map(
              (step, index) => (
                <li key={step}>
                  <span className="admin-gmail-step-number" aria-hidden="true">
                    {calendar.formatNumber(index + 1)}
                  </span>
                  <span>{t(step)}</span>
                </li>
              ),
            )}
          </ol>
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="button small admin-gmail-link"
          >
            <LinkIcon /> {t("admin.gmailOpenPasswords")}
          </a>
        </section>
      </aside>
    </div>
  );
}

function General() {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const { data, isError, error, refetch } = useQuery({
    queryKey: ["admin-general"],
    queryFn: adminApi.general,
  });
  const [form, setForm] = useState<GeneralSettings | null>(null);
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);
  if (isError && !form) return <AdminLoadError error={error} onRetry={() => void refetch()} />;
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
    <form className="card stack" onSubmit={save}>
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

function DriveLimits() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const { data, isError, error, refetch } = useQuery({
    queryKey: ["admin-drive"],
    queryFn: driveApi.settings,
  });
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminApi.stats });
  const [form, setForm] = useState<DriveSettings | null>(null);
  const [blocked, setBlocked] = useState("");
  useEffect(() => {
    if (data && !form) {
      setForm(data);
      setBlocked(data.blocked_extensions.join(", "));
    }
  }, [data, form]);
  if (isError && !form) return <AdminLoadError error={error} onRetry={() => void refetch()} />;
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
    <form className="card stack" onSubmit={save}>
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
