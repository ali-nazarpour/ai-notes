/**
 * Password manager. Three states:
 *   1. not set up  -> choose a master password
 *   2. locked      -> enter the master password (the key is derived in the browser)
 *   3. unlocked    -> the manager (VaultManager)
 * The master password and the decrypted items never leave the browser.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { vaultApi } from "../../api/endpoints";
import { queryKeys } from "../../api/queries";
import { useToast } from "../../components/Feedback";
import { EyeIcon, EyeOffIcon, KeyIcon, LockIcon, ShieldIcon, UnlockIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { passwordStrength } from "../../lib/passwords";
import { createKeyMaterial, unlockKey, WrongMasterPasswordError } from "../../lib/vaultCrypto";
import { useVaultKey, vaultSession } from "../../store/vaultSession";
import type { User } from "../../types";
import { StrengthMeter } from "./PasswordGenerator";
import { VaultManager } from "./VaultManager";

function MasterPasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="icon-button small"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function SetupScreen({ user }: { user: User }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const weak = passwordStrength(password).level < 2;
  const mismatch = repeat.length > 0 && repeat !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch || weak || !understood) return;
    setBusy(true);
    try {
      const { key, setup } = await createKeyMaterial(password);
      await vaultApi.setup(setup);
      vaultSession.unlock(user.id, key);
      await client.invalidateQueries({ queryKey: queryKeys.vaultStatus });
      toast(t("vault.created"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
      setBusy(false);
    }
  }

  return (
    <div className="vault-gate">
      <div className="vault-gate-card card wide">
        <span className="vault-gate-icon">
          <ShieldIcon />
        </span>
        <h1>{t("vault.setupTitle")}</h1>
        <p className="muted">{t("vault.setupHint")}</p>
        <ul className="vault-points">
          <li>{t("vault.point.encrypted")}</li>
          <li>{t("vault.point.local")}</li>
          <li>{t("vault.point.lock")}</li>
        </ul>
        <form className="stack" onSubmit={submit}>
          <label htmlFor="master-new" className="field-label">
            {t("vault.masterPassword")}
          </label>
          <MasterPasswordInput
            id="master-new"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            autoFocus
          />
          <StrengthMeter password={password} />
          {password && weak && <span className="error-hint">{t("vault.tooWeak")}</span>}
          <label htmlFor="master-repeat" className="field-label">
            {t("security.repeatPassword")}
          </label>
          <MasterPasswordInput
            id="master-repeat"
            value={repeat}
            onChange={setRepeat}
            autoComplete="new-password"
          />
          {mismatch && <span className="error-hint">{t("security.mismatch")}</span>}
          <label className="check-row warning-check">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
            />
            <span>{t("vault.noRecovery")}</span>
          </label>
          <button
            type="submit"
            className="primary block"
            disabled={busy || weak || mismatch || !repeat || !understood}
          >
            {busy ? t("vault.creating") : t("vault.create")}
          </button>
        </form>
      </div>
    </div>
  );
}

function ResetDialog({ onClose }: { onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await vaultApi.reset(password);
      vaultSession.lock();
      await client.invalidateQueries({ queryKey: queryKeys.vaultStatus });
      toast(t("vault.resetDone"));
      onClose();
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("vault.resetTitle")}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="vault-reset" className="danger-solid" disabled={busy || !password}>
            {t("vault.resetButton")}
          </button>
        </>
      }
    >
      <form id="vault-reset" className="stack" onSubmit={submit}>
        <p>{t("vault.resetMessage")}</p>
        <label className="form-field">
          <span className="field-label">{t("vault.accountPassword")}</span>
          <input
            type="password"
            data-autofocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      </form>
    </Modal>
  );
}

function UnlockScreen({ user, onUnlocked }: { user: User; onUnlocked: (key: CryptoKey) => void }) {
  const i18n = useI18n();
  const { t, plural } = i18n;
  const { data: status } = useQuery({ queryKey: queryKeys.vaultStatus, queryFn: vaultApi.status });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const key = await unlockKey(password, status);
      vaultSession.unlock(user.id, key);
      onUnlocked(key);
    } catch (err) {
      setError(err instanceof WrongMasterPasswordError ? t("vault.wrongMaster") : errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <div className="vault-gate">
      <div className="vault-gate-card card">
        <span className="vault-gate-icon">
          <LockIcon />
        </span>
        <h1>{t("vault.lockedTitle")}</h1>
        <p className="muted">
          {status ? plural("vault.itemCount", status.item_count) : ""} · {t("vault.lockedHint")}
        </p>
        <form className="stack" onSubmit={submit}>
          <label htmlFor="master-unlock" className="field-label">
            {t("vault.masterPassword")}
          </label>
          <MasterPasswordInput
            id="master-unlock"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            autoFocus
          />
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary block" disabled={busy || !password}>
            <UnlockIcon /> {busy ? t("vault.unlocking") : t("vault.unlock")}
          </button>
        </form>
        <button type="button" className="link-button vault-forgot" onClick={() => setResetting(true)}>
          {t("vault.forgot")}
        </button>
      </div>
      {resetting && <ResetDialog onClose={() => setResetting(false)} />}
    </div>
  );
}

export function PasswordsPage({ user }: { user: User }) {
  const { t } = useI18n();
  const key = useVaultKey(user.id);
  const { data: status, isLoading } = useQuery({ queryKey: queryKeys.vaultStatus, queryFn: vaultApi.status });

  if (isLoading || !status) return <Skeleton rows={4} height={56} />;
  if (!status.configured) return <SetupScreen user={user} />;
  if (!key) return <UnlockScreen user={user} onUnlocked={() => undefined} />;
  return (
    <VaultManager
      user={user}
      cryptoKey={key}
      status={status}
      title={
        <>
          <KeyIcon /> {t("nav.passwords")}
        </>
      }
    />
  );
}
