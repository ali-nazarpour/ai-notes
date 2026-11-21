/** Settings sections for the current workspace: general, members & invitations, editor. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { workspaceApi } from "../../api/v4";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  CopyIcon,
  GlobeIcon,
  LogOutIcon,
  MailIcon,
  SparkleIcon,
  TrashIcon,
  UserPlusIcon,
} from "../../components/Icons";
import { ColorPicker, ThemeSwitch } from "../../components/ui";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { useAccounts } from "../../store/accounts";
import { workspaceStore } from "../../store/workspace";
import type { FontStyle, User } from "../../types";
import type { InviteRole, Workspace, WorkspaceChanges } from "../../types4";
import { workspaceKeys, useWorkspace } from "./WorkspaceContext";
import { WorkspaceMark } from "./WorkspaceSwitcher";

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

function useSaveWorkspace() {
  const i18n = useI18n();
  const toast = useToast();
  const { refresh } = useWorkspace();
  return async (changes: WorkspaceChanges) => {
    try {
      await workspaceApi.update(changes);
      await refresh();
      toast(i18n.t("settings.saved"), "success");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  };
}

const ICONS = ["🏠", "💼", "🚀", "🎓", "🧪", "🎨", "📚", "🏢", "💡", "🌱", "🎯", "⚡"];

export function WorkspaceSection({ user }: { user: User }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { workspace, isAdmin } = useWorkspace();
  const save = useSaveWorkspace();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(workspace?.name ?? "");
  const [description, setDescription] = useState(workspace?.description ?? "");
  // The workspace may still be loading on the first render.
  const loadedId = workspace?.id;
  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name);
    setDescription(workspace.description);
    // Only when another workspace is loaded, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);
  if (!workspace) return null;
  const disabled = !isAdmin;
  const settings = workspace.settings;

  async function remove(target: Workspace) {
    const ok = await confirm({
      title: t("workspace.delete"),
      message: t("workspace.deleteMessage", { name: target.name }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await workspaceApi.remove();
      workspaceStore.set(user.id, null);
      navigate("/");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  return (
    <>
      <Card
        title={t("workspace.general")}
        description={disabled ? t("workspace.adminOnly") : t("workspace.generalHint")}
      >
        <form
          className="workspace-general"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void save({ name: name.trim() || workspace.name, description });
          }}
        >
          <WorkspaceMark workspace={workspace} size="lg" />
          <fieldset disabled={disabled} className="stack">
            <label className="field">
              <span className="field-label">{t("workspace.name")}</span>
              <input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t("workspace.description")}</span>
              <input
                maxLength={300}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="emoji-grid">
              {ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-option"
                  aria-pressed={workspace.icon === emoji}
                  onClick={() => void save({ icon: emoji })}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="row-end">
              <button type="submit" className="primary">
                {t("common.save")}
              </button>
            </div>
          </fieldset>
        </form>
      </Card>

      <Card title={t("workspace.look")} description={t("workspace.lookHint")}>
        <fieldset disabled={disabled} className="stack">
          <ThemeSwitch
            theme={workspace.theme ?? user.theme}
            onChange={(theme) => void save({ theme })}
            size="large"
          />
          <ColorPicker
            label={t("settings.accent")}
            value={workspace.accent_color ?? user.accent_color}
            onChange={(accent_color) => void save({ accent_color })}
          />
          {(workspace.theme || workspace.accent_color) && (
            <button
              type="button"
              className="link-button small"
              onClick={() => void save({ theme: null, accent_color: null })}
            >
              {t("workspace.useMine")}
            </button>
          )}
        </fieldset>
      </Card>

      <Card title={t("workspace.features")}>
        <fieldset disabled={disabled} className="stack">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.ai_enabled}
              onChange={(event) => void save({ settings: { ai_enabled: event.target.checked } })}
            />
            <span>
              <strong>
                <SparkleIcon /> {t("workspace.aiEnabled")}
              </strong>
              <span className="hint">{t("workspace.aiEnabledHint")}</span>
            </span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.blog_public}
              onChange={(event) => void save({ settings: { blog_public: event.target.checked } })}
            />
            <span>
              <strong>
                <GlobeIcon /> {t("workspace.blogPublic")}
              </strong>
              <span className="hint">
                {t("workspace.blogPublicHint")}{" "}
                <code dir="ltr">
                  {window.location.origin}/w/{workspace.slug}/blog
                </code>
              </span>
            </span>
          </label>
        </fieldset>
      </Card>

      <Card title={t("workspace.pageDefaults")} description={t("workspace.pageDefaultsHint")}>
        <fieldset disabled={disabled} className="stack">
          <div className="font-choices wide">
            {(["default", "serif", "mono"] as FontStyle[]).map((font) => (
              <button
                key={font}
                type="button"
                className="font-choice"
                data-font={font}
                aria-pressed={settings.default_font === font}
                onClick={() => void save({ settings: { default_font: font } })}
              >
                <span className="font-sample">Ag</span>
                <span>{t(`page.font.${font}`)}</span>
              </button>
            ))}
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.full_width}
              onChange={(event) => void save({ settings: { full_width: event.target.checked } })}
            />
            <span>{t("page.fullWidth")}</span>
          </label>
        </fieldset>
      </Card>

      <Card title={t("settings.section.danger")}>
        {workspace.role === "owner" ? (
          <button type="button" className="danger-outline" onClick={() => void remove(workspace)}>
            <TrashIcon /> {t("workspace.delete")}
          </button>
        ) : (
          <LeaveButton />
        )}
      </Card>
    </>
  );
}

function LeaveButton() {
  const i18n = useI18n();
  const { t } = i18n;
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const user = useAccounts().active?.user;
  const { workspace } = useWorkspace();
  const members = useQuery({ queryKey: workspaceKeys.members, queryFn: workspaceApi.members });
  const me = members.data?.find((m) => m.user_id === user?.id);
  return (
    <button
      type="button"
      className="danger-outline"
      disabled={!me}
      onClick={async () => {
        if (!me || !user) return;
        const ok = await confirm({
          title: t("workspace.leave"),
          message: t("workspace.leaveMessage", { name: workspace?.name ?? "" }),
          confirmLabel: t("workspace.leave"),
          danger: true,
        });
        if (!ok) return;
        try {
          await workspaceApi.removeMember(me.id);
          workspaceStore.set(user.id, null);
          navigate("/");
        } catch (err) {
          toast(errorMessage(err, i18n), "error");
        }
      }}
    >
      <LogOutIcon /> {t("workspace.leave")}
    </button>
  );
}

export function MembersSection() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const user = useAccounts().active?.user;
  const { workspace, isAdmin } = useWorkspace();
  const members = useQuery({ queryKey: workspaceKeys.members, queryFn: workspaceApi.members });
  const invites = useQuery({
    queryKey: workspaceKeys.invites,
    queryFn: workspaceApi.invites,
    enabled: isAdmin,
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ link: string; status: string } | null>(null);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await client.invalidateQueries({ queryKey: workspaceKeys.members });
      await client.invalidateQueries({ queryKey: workspaceKeys.invites });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await workspaceApi.invite(email.trim(), role, message);
      setLastLink({ link: created.link, status: created.email_status });
      toast(
        created.email_status === "sent"
          ? t("invite.sent", { email: created.email })
          : t("invite.createdNoEmail"),
        created.email_status === "failed" ? "error" : "success",
      );
      setEmail("");
      setMessage("");
      await client.invalidateQueries({ queryKey: workspaceKeys.invites });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {isAdmin && (
        <Card
          title={t("workspace.inviteTitle", { name: workspace?.name ?? "" })}
          description={t("workspace.inviteHint")}
        >
          <form className="invite-form" onSubmit={invite}>
            <input
              type="email"
              dir="ltr"
              required
              placeholder={t("share.emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as InviteRole)}
              aria-label={t("share.role")}
            >
              {workspace?.role === "owner" && <option value="admin">{t("role.admin")}</option>}
              <option value="editor">{t("role.editor")}</option>
              <option value="viewer">{t("role.viewer")}</option>
            </select>
            <button type="submit" className="primary" disabled={busy || !email.trim()}>
              <UserPlusIcon /> {t("workspace.sendInvite")}
            </button>
            <input
              className="invite-message"
              maxLength={500}
              placeholder={t("workspace.inviteMessage")}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </form>
          <p className="hint">{t("workspace.rolesHint")}</p>
          {lastLink && (
            <div className="link-card">
              <MailIcon />
              <span className="small">
                {lastLink.status === "sent" ? t("invite.linkSent") : t("invite.linkCopy")}
              </span>
              <code dir="ltr">{lastLink.link}</code>
              <button
                type="button"
                className="ghost small"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(lastLink.link)
                    .then(() => toast(t("common.copied"), "success"))
                }
              >
                <CopyIcon /> {t("common.copy")}
              </button>
            </div>
          )}
        </Card>
      )}

      <Card title={t("workspace.membersTitle", { count: members.data?.length ?? 0 })}>
        <ul className="people-list">
          {members.data?.map((member) => (
            <li key={member.id}>
              <span className="avatar avatar-sm" aria-hidden="true">
                {member.avatar ? <img src={member.avatar} alt="" /> : member.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="people-text">
                <strong>
                  {member.name}{" "}
                  {member.user_id === user?.id && <span className="badge">{t("account.you")}</span>}
                </strong>
                <span className="muted small" dir="ltr">
                  {member.email}
                </span>
              </span>
              {member.role === "owner" || !isAdmin || member.user_id === user?.id ? (
                <span className="badge">{t(`role.${member.role}`)}</span>
              ) : (
                <>
                  <select
                    value={member.role}
                    aria-label={t("share.role")}
                    onChange={(event) =>
                      void run(() => workspaceApi.updateMember(member.id, event.target.value as InviteRole))
                    }
                  >
                    {workspace?.role === "owner" && <option value="admin">{t("role.admin")}</option>}
                    <option value="editor">{t("role.editor")}</option>
                    <option value="viewer">{t("role.viewer")}</option>
                  </select>
                  <button
                    type="button"
                    className="icon-button small danger"
                    title={t("workspace.removeMember")}
                    aria-label={t("workspace.removeMember")}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t("workspace.removeMember"),
                        message: t("workspace.removeMemberMessage", { name: member.name }),
                        confirmLabel: t("common.delete"),
                        danger: true,
                      });
                      if (ok) await run(() => workspaceApi.removeMember(member.id));
                    }}
                  >
                    <TrashIcon />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isAdmin && (invites.data?.length ?? 0) > 0 && (
        <Card title={t("workspace.pending")}>
          <ul className="people-list">
            {invites.data?.map((item) => (
              <li key={item.id}>
                <span className="avatar avatar-sm" aria-hidden="true">
                  <MailIcon />
                </span>
                <span className="people-text">
                  <strong dir="ltr">{item.email}</strong>
                  <span className="muted small">
                    {t(`role.${item.role}`)} ·{" "}
                    {t("workspace.expires", { date: calendar.shortDate(item.expires_at) })}
                  </span>
                </span>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => void run(() => workspaceApi.invite(item.email, item.role))}
                >
                  {t("workspace.resend")}
                </button>
                <button
                  type="button"
                  className="icon-button small danger"
                  aria-label={t("workspace.revoke")}
                  title={t("workspace.revoke")}
                  onClick={() => void run(() => workspaceApi.revokeInvite(item.id))}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export function EditorSection() {
  const { t } = useI18n();
  const [spellcheck, setSpellcheck] = useLocalStorage<boolean>("notes.editor.spellcheck", true);
  const [autoEmbed, setAutoEmbed] = useLocalStorage<boolean>("notes.editor.autoEmbed", true);
  return (
    <Card title={t("settings.editorPrefs")} description={t("settings.editorPrefsHint")}>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={spellcheck}
          onChange={(event) => setSpellcheck(event.target.checked)}
        />
        <span>
          <strong>{t("settings.spellcheck")}</strong>
          <span className="hint">{t("settings.spellcheckHint")}</span>
        </span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={autoEmbed} onChange={(event) => setAutoEmbed(event.target.checked)} />
        <span>
          <strong>{t("settings.autoEmbed")}</strong>
          <span className="hint">{t("settings.autoEmbedHint")}</span>
        </span>
      </label>
    </Card>
  );
}
