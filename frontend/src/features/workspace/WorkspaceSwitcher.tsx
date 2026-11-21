/** Sidebar header: the current workspace, a list to switch, and "new workspace". */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { workspaceApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import { CheckIcon, ChevronDownIcon, PlusIcon, SettingsIcon, UserPlusIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { ColorPicker, Popover } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { paletteColor } from "../../lib/palette";
import { useAccounts } from "../../store/accounts";
import { workspaceStore } from "../../store/workspace";
import type { ColorName } from "../../types";
import type { Workspace } from "../../types4";
import { useWorkspace } from "./WorkspaceContext";

const ICONS = ["🏠", "💼", "🚀", "🎓", "🧪", "🎨", "📚", "🏢", "💡", "🌱", "🎯", "⚡"];

export function WorkspaceMark({
  workspace,
  size = "md",
}: {
  workspace: Workspace | null;
  size?: "md" | "lg";
}) {
  const color = paletteColor(workspace?.accent_color ?? "indigo");
  return (
    <span
      className={`ws-mark ws-mark-${size}`}
      style={{ background: `color-mix(in srgb, ${color.hex} 18%, var(--surface))`, color: color.hex }}
      aria-hidden="true"
    >
      {workspace?.icon || (workspace?.name ?? "N").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const { workspace, workspaces, switchTo, isAdmin } = useWorkspace();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Popover
        label={t("workspace.switch")}
        className="ws-switcher"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className="ws-trigger"
            aria-expanded={open}
            onClick={toggle}
            title={workspace?.name ?? t("app.name")}
          >
            <WorkspaceMark workspace={workspace} />
            {!collapsed && (
              <>
                <span className="ws-trigger-text label">
                  <span className="ws-name">{workspace?.name ?? t("app.name")}</span>
                  <span className="ws-sub">
                    {workspace ? t(`role.${workspace.role}`) : ""}
                    {workspace && workspace.member_count > 1
                      ? ` · ${t("workspace.members", { count: workspace.member_count })}`
                      : ""}
                  </span>
                </span>
                <ChevronDownIcon />
              </>
            )}
          </button>
        )}
      >
        {(close) => (
          <div className="ws-menu">
            <p className="menu-heading">{t("workspace.yours")}</p>
            {workspaces.map((item) => (
              <button
                key={item.id}
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  if (item.id !== workspace?.id) {
                    switchTo(item.id);
                    navigate("/");
                  }
                }}
              >
                <WorkspaceMark workspace={item} />
                <span className="menu-item-text">
                  <span>{item.name}</span>
                  <span className="muted small">{t(`role.${item.role}`)}</span>
                </span>
                {item.id === workspace?.id && <CheckIcon />}
              </button>
            ))}
            <div className="menu-separator" />
            {isAdmin && (
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  navigate("/settings/members");
                }}
              >
                <UserPlusIcon /> <span className="menu-item-text">{t("workspace.invite")}</span>
              </button>
            )}
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close();
                navigate("/settings/workspace");
              }}
            >
              <SettingsIcon /> <span className="menu-item-text">{t("workspace.settings")}</span>
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close();
                setCreating(true);
              }}
            >
              <PlusIcon /> <span className="menu-item-text">{t("workspace.new")}</span>
            </button>
          </div>
        )}
      </Popover>
      {creating && <CreateWorkspaceDialog onClose={() => setCreating(false)} />}
    </>
  );
}

export function CreateWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const navigate = useNavigate();
  const userId = useAccounts().active?.user.id;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("💼");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ColorName>("blue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || userId == null) return;
    setBusy(true);
    try {
      const created = await workspaceApi.create({
        name: name.trim(),
        icon,
        description,
        accent_color: color,
      });
      toast(t("workspace.created"), "success");
      workspaceStore.set(userId, created.id);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  const preview: Workspace = {
    id: 0,
    name: name || t("workspace.namePlaceholder"),
    slug: "",
    icon,
    description,
    accent_color: color,
    theme: null,
    cover: null,
    settings: {
      blog_public: false,
      ai_enabled: true,
      default_font: "default",
      full_width: false,
      week_start: "auto",
    },
    owner_id: 0,
    role: "owner",
    member_count: 1,
    created_at: "",
  };

  return (
    <Modal
      title={t("workspace.new")}
      icon={PlusIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="workspace-form" className="primary" disabled={busy || !name.trim()}>
            {busy ? t("common.saving") : t("common.create")}
          </button>
        </>
      }
    >
      <form id="workspace-form" className="modal-split" onSubmit={submit}>
        <aside className="modal-split-aside">
          <div className="ws-preview" style={{ ["--ws-color" as string]: paletteColor(color).hex }}>
            <WorkspaceMark workspace={preview} size="lg" />
            <strong>{preview.name}</strong>
            <span className="muted small">{description || t("workspace.descriptionHint")}</span>
          </div>
          <p className="hint">{t("workspace.explain")}</p>
        </aside>
        <div className="stack">
          <label className="field">
            <span className="field-label">{t("workspace.name")}</span>
            <input
              data-autofocus
              maxLength={80}
              required
              value={name}
              placeholder={t("workspace.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("workspace.description")}</span>
            <input
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="field">
            <span className="field-label">{t("categories.emoji")}</span>
            <div className="emoji-grid">
              {ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-option"
                  aria-pressed={icon === emoji}
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">{t("settings.accent")}</span>
            <ColorPicker label={t("settings.accent")} size="sm" value={color} onChange={setColor} />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
