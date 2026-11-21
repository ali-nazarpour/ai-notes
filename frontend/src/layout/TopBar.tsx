/** Top bar: global search, quick add, and the account menu. */
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import { authApi } from "../api/endpoints";
import { CheckIcon, LogOutIcon, PlusIcon, SettingsIcon, UserPlusIcon } from "../components/Icons";
import { Avatar, displayName } from "../components/ui";
import { useDismiss } from "../hooks/useDismiss";
import { useI18n } from "../i18n";
import { accountStore, useAccounts } from "../store/accounts";
import { GlobalSearch } from "./GlobalSearch";

export { SEARCH_INPUT_ID } from "./GlobalSearch";

function AccountMenu({ onAddAccount }: { onAddAccount: () => void }) {
  const { t } = useI18n();
  const { accounts, active } = useAccounts();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  if (!active) return null;

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  const signOut = async () => {
    await authApi.logout().catch(() => undefined);
    accountStore.signOut(active.user.id);
  };

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="avatar-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account.menu", { email: active.user.email })}
        onClick={() => setOpen(!open)}
      >
        <Avatar user={active.user} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">
            <Avatar user={active.user} size="lg" />
            <div className="menu-item-text">
              <span className="menu-name">{displayName(active.user)}</span>
              <span className="muted small">{active.user.email}</span>
            </div>
          </div>
          {accounts.length > 1 && (
            <>
              <p className="menu-heading">{t("account.switch")}</p>
              {accounts.map((account) => (
                <button
                  key={account.user.id}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => choose(() => accountStore.switchTo(account.user.id))}
                >
                  <Avatar user={account.user} size="sm" />
                  <span className="menu-item-text">
                    <span>{displayName(account.user)}</span>
                    <span className="muted small">{account.user.email}</span>
                  </span>
                  {account.user.id === active.user.id && <CheckIcon />}
                </button>
              ))}
            </>
          )}
          <div className="menu-separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onAddAccount)}>
            <UserPlusIcon />
            {t("account.add")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => choose(() => navigate("/settings"))}
          >
            <SettingsIcon />
            {t("nav.settings")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={() => choose(() => void signOut())}
          >
            <LogOutIcon />
            {t("account.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ onQuickAdd, onAddAccount }: { onQuickAdd: () => void; onAddAccount: () => void }) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <span className="brand-mark topbar-brand" aria-hidden="true">
        N
      </span>
      <GlobalSearch />
      <button type="button" className="primary topbar-new" onClick={onQuickAdd} title={t("quickAdd.title")}>
        <PlusIcon />
        <span>{t("common.new")}</span>
      </button>
      <AccountMenu onAddAccount={onAddAccount} />
    </header>
  );
}
