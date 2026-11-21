/** Share one item (note, board, documentation, project) with registered users by email. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";

import { sharesApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import { CopyIcon, LinkIcon, ShareIcon, TrashIcon, UsersIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { ShareKind, ShareRole } from "../../types4";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function ShareDialog({
  kind,
  itemId,
  title,
  onClose,
  extra,
}: {
  kind: ShareKind;
  itemId: number;
  title: string;
  onClose: () => void;
  /** Shown in the side column instead of "copy link" (e.g. the drive's public link). */
  extra?: ReactNode;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const { workspace, isAdmin } = useWorkspace();
  const key = ["shares", kind, itemId];
  const { data: shares = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => sharesApi.list(kind, itemId),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sharesApi.create(kind, itemId, email.trim(), role);
      setEmail("");
      toast(t("share.added"), "success");
      await client.invalidateQueries({ queryKey: key });
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await client.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href.split("?")[0]).catch(() => undefined);
    toast(t("common.copied"), "success");
  }

  return (
    <Modal
      title={t("share.title", { title: title || t("notes.untitled") })}
      icon={ShareIcon}
      onClose={onClose}
      size="lg"
    >
      <div className="modal-split share-dialog">
        <aside className="modal-split-aside">
          <div className="share-explain">
            <UsersIcon />
            <p>{t("share.workspaceAccess", { name: workspace?.name ?? "" })}</p>
            {isAdmin && (
              <Link to="/settings/members" className="button small" onClick={onClose}>
                {t("workspace.invite")}
              </Link>
            )}
          </div>
          {extra ?? (
            <>
              <button type="button" className="ghost small" onClick={() => void copyLink()}>
                <LinkIcon /> {t("share.copyLink")}
              </button>
              <p className="hint">{t("share.linkHint")}</p>
            </>
          )}
        </aside>
        <div className="stack">
          <form className="share-form" onSubmit={add}>
            <input
              type="email"
              dir="ltr"
              data-autofocus
              required
              placeholder={t("share.emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as ShareRole)}
              aria-label={t("share.role")}
            >
              <option value="viewer">{t("role.viewer")}</option>
              <option value="editor">{t("role.editor")}</option>
            </select>
            <button type="submit" className="primary" disabled={busy || !email.trim()}>
              {t("share.invite")}
            </button>
          </form>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <p className="field-label">{t("share.people")}</p>
          {isLoading ? (
            <p className="muted">{t("common.loading")}</p>
          ) : shares.length ? (
            <ul className="people-list">
              {shares.map((share) => (
                <li key={share.id}>
                  <span className="avatar avatar-sm" aria-hidden="true">
                    {share.avatar ? <img src={share.avatar} alt="" /> : share.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="people-text">
                    <strong>{share.name}</strong>
                    <span className="muted small" dir="ltr">
                      {share.email}
                    </span>
                  </span>
                  <select
                    value={share.role}
                    aria-label={t("share.role")}
                    onChange={(event) =>
                      void run(() => sharesApi.update(share.id, event.target.value as ShareRole))
                    }
                  >
                    <option value="viewer">{t("role.viewer")}</option>
                    <option value="editor">{t("role.editor")}</option>
                  </select>
                  <button
                    type="button"
                    className="icon-button small danger"
                    title={t("share.remove")}
                    aria-label={t("share.remove")}
                    onClick={() => void run(() => sharesApi.remove(share.id))}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{t("share.nobody")}</p>
          )}
          <p className="hint">
            <CopyIcon /> {t("share.registeredOnly")}
          </p>
        </div>
      </div>
    </Modal>
  );
}
