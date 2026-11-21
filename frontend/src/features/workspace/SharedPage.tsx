/** Invitations to workspaces and items other people shared with me. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";

import { invitesApi, sharesApi } from "../../api/v4";
import { useToast } from "../../components/Feedback";
import {
  BoardIcon,
  BookIcon,
  CheckIcon,
  CloseIcon,
  DriveIcon,
  type IconComponent,
  InboxIcon,
  NotesIcon,
  RocketIcon,
  ShareIcon,
  SlidesIcon,
  UserPlusIcon,
} from "../../components/Icons";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { useAccounts } from "../../store/accounts";
import { workspaceStore } from "../../store/workspace";
import type { ShareKind } from "../../types4";
import { workspaceKeys } from "./WorkspaceContext";

const KIND_ICON: Record<ShareKind, IconComponent> = {
  note: NotesIcon,
  board: BoardIcon,
  doc: BookIcon,
  project: RocketIcon,
  drive: DriveIcon,
  deck: SlidesIcon,
};

export function SharedPage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const userId = useAccounts().active?.user.id;
  const invites = useQuery({ queryKey: workspaceKeys.myInvites, queryFn: invitesApi.mine });
  const shared = useQuery({ queryKey: workspaceKeys.shared, queryFn: sharesApi.withMe });
  const query = usePageQuery();

  async function accept(id: number) {
    try {
      const workspace = await invitesApi.accept(id);
      toast(t("invite.joined", { name: workspace.name }), "success");
      if (userId != null) workspaceStore.set(userId, workspace.id);
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function decline(id: number) {
    try {
      await invitesApi.decline(id);
      await client.invalidateQueries({ queryKey: workspaceKeys.myInvites });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function leave(shareId: number) {
    try {
      await sharesApi.remove(shareId);
      await client.invalidateQueries({ queryKey: workspaceKeys.shared });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  return (
    <div className="page shared-page">
      <PageHeader title={t("nav.shared")} subtitle={t("shared.subtitle")} />

      {(invites.data?.length ?? 0) > 0 && (
        <section className="card shared-section">
          <h2 className="section-title">
            <UserPlusIcon /> {t("shared.invites")}
          </h2>
          <ul className="invite-list">
            {invites.data?.map((invite) => (
              <li key={invite.id} className="invite-item">
                <span className="ws-mark" aria-hidden="true">
                  {invite.workspace_icon || invite.workspace_name.slice(0, 1)}
                </span>
                <span className="invite-text">
                  <strong>{invite.workspace_name}</strong>
                  <span className="muted small">
                    {t("shared.invitedBy", {
                      name: invite.invited_by || "—",
                      role: t(`role.${invite.role}`),
                    })}
                  </span>
                </span>
                <button type="button" className="primary small" onClick={() => void accept(invite.id)}>
                  <CheckIcon /> {t("invite.accept")}
                </button>
                <button
                  type="button"
                  className="icon-button small"
                  title={t("invite.decline")}
                  aria-label={t("invite.decline")}
                  onClick={() => void decline(invite.id)}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="shared-section">
        <h2 className="section-title">
          <ShareIcon /> {t("shared.withMe")}
        </h2>
        {shared.isLoading ? (
          <Skeleton rows={3} />
        ) : !shared.data?.length ? (
          <EmptyState icon={InboxIcon} title={t("shared.empty")} hint={t("shared.emptyHint")} />
        ) : (
          <div className="shared-grid">
            {shared.data
              .filter((item) => matchesQuery(query, item.title, item.workspace_name))
              .map((item) => {
                const KindIcon = KIND_ICON[item.kind];
                return (
                  <div key={item.share_id} className="shared-card">
                    <Link to={item.url} className="shared-card-link">
                      <span className="shared-kind">
                        <KindIcon /> {t(`shared.kind.${item.kind}`)}
                      </span>
                      <strong dir="auto">{item.title || t("notes.untitled")}</strong>
                      <span className="muted small">
                        {t("shared.from", { name: item.shared_by || "—", workspace: item.workspace_name })}
                      </span>
                      <span className="muted small">
                        {t(`role.${item.role}`)} · {calendar.shortDate(item.created_at)}
                      </span>
                    </Link>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => void leave(item.share_id)}
                      title={t("shared.remove")}
                    >
                      <CloseIcon /> {t("shared.remove")}
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
