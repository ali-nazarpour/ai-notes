/**
 * /invite/:token — the link from an invitation email.
 * Signed out: shows who invited you and lets you sign up / sign in with the invited email.
 * Signed in with that email: accept, switch to the workspace and open it.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { invitesApi } from "../../api/v4";
import { AlertIcon, UserPlusIcon } from "../../components/Icons";
import { Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { accountStore } from "../../store/accounts";
import { workspaceStore } from "../../store/workspace";
import type { SavedAccount } from "../../types";
import { AuthScreen } from "./AuthScreen";

export function InvitePage({ accounts, active }: { accounts: SavedAccount[]; active: SavedAccount | null }) {
  const { token = "" } = useParams();
  const i18n = useI18n();
  const { t } = i18n;
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useQuery({
    queryKey: ["invite", token],
    queryFn: () => invitesApi.preview(token),
    retry: false,
  });
  const invite = preview.data;
  const matching = invite ? accounts.find((a) => a.user.email === invite.email) : undefined;

  async function accept(account: SavedAccount) {
    setBusy(true);
    setError(null);
    try {
      accountStore.switchTo(account.user.id);
      const workspace = await invitesApi.acceptToken(token);
      workspaceStore.set(account.user.id, workspace.id);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  if (preview.isLoading) return <Skeleton rows={4} />;
  if (!invite) {
    return (
      <div className="public-shell">
        <div className="auth-card public-card">
          <AlertIcon />
          <h1>{t("invite.invalid")}</h1>
          <p className="muted">{errorMessage(preview.error, i18n)}</p>
          <button type="button" className="primary" onClick={() => navigate("/")}>
            {t("common.back")}
          </button>
        </div>
      </div>
    );
  }

  if (!matching) {
    return (
      <AuthScreen
        accounts={accounts}
        onCancel={active ? () => navigate("/") : undefined}
        onDone={() => {
          const signedIn = accountStore.getActive();
          if (signedIn) void accept(signedIn);
        }}
        invite={{ token, email: invite.email, workspaceName: invite.workspace_name }}
      />
    );
  }

  return (
    <div className="public-shell">
      <div className="auth-card public-card invite-card">
        <span className="ws-mark ws-mark-lg" aria-hidden="true">
          {invite.workspace_icon || invite.workspace_name.slice(0, 1)}
        </span>
        <h1>{t("invite.joinTitle", { name: invite.workspace_name })}</h1>
        <p className="muted">
          {t("shared.invitedBy", { name: invite.invited_by || "—", role: t(`role.${invite.role}`) })}
        </p>
        <p className="small" dir="ltr">
          {invite.email}
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="primary block" disabled={busy} onClick={() => void accept(matching)}>
          <UserPlusIcon /> {busy ? t("common.pleaseWait") : t("invite.accept")}
        </button>
        <button type="button" className="ghost block" onClick={() => navigate("/")}>
          {t("invite.later")}
        </button>
      </div>
    </div>
  );
}
