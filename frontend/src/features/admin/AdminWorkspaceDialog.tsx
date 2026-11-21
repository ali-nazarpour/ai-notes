import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { adminApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import { FolderIcon, FolderPlusIcon, TrashIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { AdminWorkspaceDetails } from "../../types4";

type WorkspaceFormValues = { name: string; description: string; icon: string };

function useRefreshWorkspaces() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["admin-workspaces"] }),
      client.invalidateQueries({ queryKey: ["admin-users"] }),
      client.invalidateQueries({ queryKey: ["admin-user"] }),
      client.invalidateQueries({ queryKey: ["admin-stats"] }),
    ]);
}

function WorkspaceForm({
  workspace,
  ownerEmail,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  workspace?: AdminWorkspaceDetails;
  ownerEmail?: string;
  onSubmit: (values: FormData) => void;
  onCancel: () => void;
  busy: boolean;
  error: string;
}) {
  const { t } = useI18n();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy) onSubmit(new FormData(event.currentTarget));
  };

  return (
    <form className="stack admin-account-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">{t("workspace.name")}</span>
          <input
            name="name"
            defaultValue={workspace?.name}
            maxLength={80}
            required
            data-autofocus
            dir="auto"
          />
        </label>
        <label className="field">
          <span className="field-label">{t("admin.workspaceIcon")}</span>
          <input name="icon" defaultValue={workspace?.icon} maxLength={16} dir="auto" />
        </label>
      </div>
      {ownerEmail !== undefined && (
        <label className="field">
          <span className="field-label">{t("admin.workspaceOwnerEmail")}</span>
          <input
            name="owner_email"
            type="email"
            defaultValue={ownerEmail}
            maxLength={254}
            required
            dir="ltr"
          />
          <span className="hint">{t("admin.workspaceOwnerHint")}</span>
        </label>
      )}
      <label className="field">
        <span className="field-label">{t("workspace.description")}</span>
        <textarea
          name="description"
          defaultValue={workspace?.description}
          maxLength={300}
          rows={3}
          dir="auto"
        />
      </label>
      {workspace && (
        <div className="stack">
          <label className="toggle-row">
            <input name="ai_enabled" type="checkbox" defaultChecked={workspace.settings.ai_enabled} />
            {t("workspace.aiEnabled")}
          </label>
          <label className="toggle-row">
            <input name="blog_public" type="checkbox" defaultChecked={workspace.settings.blog_public} />
            {t("workspace.blogPublic")}
          </label>
        </div>
      )}
      {error && (
        <div className="admin-account-error" role="alert">
          {error}
        </div>
      )}
      <div className="row-end">
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {t(busy ? "common.loading" : workspace ? "common.save" : "admin.createWorkspace")}
        </button>
      </div>
    </form>
  );
}

function workspaceValues(form: FormData): WorkspaceFormValues {
  return {
    name: String(form.get("name") ?? "").trim(),
    description: String(form.get("description") ?? "").trim(),
    icon: String(form.get("icon") ?? "").trim(),
  };
}

export function CreateWorkspaceDialog({
  ownerEmail,
  onCreated,
  onClose,
}: {
  ownerEmail: string;
  onCreated: (id: number) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const refresh = useRefreshWorkspaces();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const details = await adminApi.createWorkspace({
        ...workspaceValues(form),
        owner_email: String(form.get("owner_email") ?? ""),
      });
      toast(t("workspace.created"), "success");
      onCreated(details.id);
      void refresh();
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("admin.createWorkspace")}
      icon={FolderPlusIcon}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <WorkspaceForm
        ownerEmail={ownerEmail}
        busy={busy}
        error={error}
        onSubmit={(form) => void create(form)}
        onCancel={onClose}
      />
    </Modal>
  );
}

export function WorkspaceDialog({
  id,
  onClose,
  onRemoved,
}: {
  id: number;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const refresh = useRefreshWorkspaces();
  const queryKey = ["admin-workspace", id];
  const query = useQuery({ queryKey, queryFn: () => adminApi.workspace(id) });
  const workspace = query.data;
  const [mode, setMode] = useState<"details" | "edit" | "delete">("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeMode(next: typeof mode) {
    setError("");
    setMode(next);
  }

  async function save(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const saved = await adminApi.updateWorkspace(id, {
        ...workspaceValues(form),
        settings: { ai_enabled: form.has("ai_enabled"), blog_public: form.has("blog_public") },
      });
      client.setQueryData(queryKey, saved);
      toast(t("admin.workspaceUpdated"), "success");
      changeMode("details");
      void refresh();
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await adminApi.removeWorkspace(id);
      onRemoved();
      toast(t("admin.workspaceDeleted"), "success");
      void refresh();
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "edit" ? (
      t("admin.editWorkspace")
    ) : workspace ? (
      <bdi>{workspace.name}</bdi>
    ) : (
      t("workspace.settings")
    );
  return (
    <Modal
      title={title}
      icon={FolderIcon}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="admin-account-modal"
    >
      {query.isError && (
        <div role="alert" className="admin-account-error">
          {errorMessage(query.error, i18n)}{" "}
          <button type="button" className="ghost small" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {query.isPending && <Skeleton rows={4} />}
      {workspace &&
        (mode === "edit" ? (
          <WorkspaceForm
            workspace={workspace}
            busy={busy}
            error={error}
            onSubmit={(form) => void save(form)}
            onCancel={() => changeMode("details")}
          />
        ) : (
          <div className="stack admin-account-details">
            <div className="admin-account-summary">
              <bdi>{workspace.slug}</bdi>
              <span className="muted small">{calendar.dateTime(workspace.created_at)}</span>
            </div>
            {workspace.description && <p dir="auto">{workspace.description}</p>}
            <dl className="admin-detail-metrics admin-workspace-metrics">
              <div>
                <dt>{t("admin.owner")}</dt>
                <dd>
                  <Link to={`/users?user=${workspace.owner_id}`}>
                    <bdi>{workspace.owner_name}</bdi>
                  </Link>
                  <bdi className="muted small">{workspace.owner_email}</bdi>
                </dd>
              </div>
              <div>
                <dt>{t("admin.members")}</dt>
                <dd>{calendar.formatNumber(workspace.member_count)}</dd>
              </div>
            </dl>
            {mode === "delete" ? (
              <div className="admin-account-confirm">
                <p>{t("workspace.deleteMessage", { name: workspace.name })}</p>
                {workspace.only_owned_workspace && <p>{t("admin.workspaceLastReplacement")}</p>}
                {error && (
                  <div role="alert" className="admin-account-error">
                    {error}
                  </div>
                )}
                <div className="row-end">
                  <button
                    type="button"
                    className="ghost small"
                    disabled={busy}
                    onClick={() => changeMode("details")}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="danger small"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="admin-account-actions">
                <button type="button" className="small" onClick={() => changeMode("edit")}>
                  {t("admin.editWorkspace")}
                </button>
                <button type="button" className="danger small" onClick={() => changeMode("delete")}>
                  <TrashIcon /> {t("workspace.delete")}
                </button>
              </div>
            )}
          </div>
        ))}
    </Modal>
  );
}
