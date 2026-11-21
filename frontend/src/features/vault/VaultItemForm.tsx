/** Create / edit a vault item. Fields depend on the type (login, card, secure note, Wi-Fi). */
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { projectsApi } from "../../api/v4";

import {
  CreditCardIcon,
  DiceIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GlobeIcon,
  type IconComponent,
  KeyIcon,
  NotesIcon,
  StarIcon,
  WifiIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { Popover } from "../../components/ui";
import { useI18n, type TranslationKey } from "../../i18n";
import type { VaultEntry, VaultEntryType } from "../../types";
import { PasswordGenerator, StrengthMeter } from "./PasswordGenerator";

export const TYPES: { type: VaultEntryType; label: TranslationKey; icon: IconComponent }[] = [
  { type: "login", label: "vault.type.login", icon: KeyIcon },
  { type: "card", label: "vault.type.card", icon: CreditCardIcon },
  { type: "note", label: "vault.type.note", icon: NotesIcon },
  { type: "wifi", label: "vault.type.wifi", icon: WifiIcon },
];

export function emptyEntry(type: VaultEntryType): VaultEntry {
  return {
    type,
    title: "",
    username: "",
    password: "",
    url: "",
    notes: "",
    folder: "",
    favorite: false,
    extra: {},
    password_changed_at: new Date().toISOString(),
  };
}

function PasswordInput({
  value,
  onChange,
  label,
  generator = true,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  generator?: boolean;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="form-field">
      <span className="field-label">{label}</span>
      <div className="input-with-actions">
        <input
          type={visible ? "text" : "password"}
          className="ltr-field mono"
          autoComplete="new-password"
          spellCheck={false}
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
        {generator && (
          <Popover
            label={t("vault.generator")}
            align="end"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="icon-button small"
                aria-expanded={open}
                onClick={toggle}
                aria-label={t("vault.generator")}
                title={t("vault.generator")}
              >
                <DiceIcon />
              </button>
            )}
          >
            {(close) => (
              <PasswordGenerator
                onUse={(password) => {
                  onChange(password);
                  setVisible(true);
                  close();
                }}
              />
            )}
          </Popover>
        )}
      </div>
      {generator && <StrengthMeter password={value} />}
    </div>
  );
}

export function VaultItemForm({
  initial,
  folders,
  onSave,
  onClose,
}: {
  initial: VaultEntry;
  folders: string[];
  onSave: (entry: VaultEntry) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [entry, setEntry] = useState<VaultEntry>(initial);
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", false],
    queryFn: () => projectsApi.list(false),
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof VaultEntry>(key: K, value: VaultEntry[K]) =>
    setEntry({ ...entry, [key]: value });
  const setExtra = (key: string, value: string) =>
    setEntry({ ...entry, extra: { ...entry.extra, [key]: value } });
  const typeInfo = TYPES.find((item) => item.type === entry.type) ?? TYPES[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!entry.title.trim()) return;
    setBusy(true);
    try {
      const changedPassword = entry.password !== initial.password;
      await onSave({
        ...entry,
        title: entry.title.trim(),
        folder: entry.folder.trim(),
        password_changed_at: changedPassword ? new Date().toISOString() : entry.password_changed_at,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const isNew = !("id" in initial);
  const details: Record<string, TranslationKey> = {
    login: "vault.form.details.login",
    card: "vault.form.details.card",
    wifi: "vault.form.details.wifi",
  };

  return (
    <Modal
      title={t(typeInfo.label)}
      description={t("vault.form.encrypted")}
      icon={typeInfo.icon}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="vault-form" className="primary" disabled={busy || !entry.title.trim()}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <form id="vault-form" className="vault-form" onSubmit={submit} autoComplete="off">
        {isNew && (
          <div className="vault-type-switch" role="radiogroup" aria-label={t("vault.form.type")}>
            {TYPES.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={entry.type === type}
                onClick={() => setEntry({ ...entry, type })}
              >
                <Icon />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="form-field">
          <label className="field-label" htmlFor="vault-item-title">
            {t("vault.field.title")}
          </label>
          <div className="vault-title-row">
            <input
              id="vault-item-title"
              type="text"
              data-autofocus
              required
              maxLength={200}
              placeholder={t(`vault.placeholder.${entry.type}`)}
              value={entry.title}
              onChange={(event) => set("title", event.target.value)}
            />
            <button
              type="button"
              className="vault-favorite"
              aria-pressed={entry.favorite}
              onClick={() => set("favorite", !entry.favorite)}
              title={entry.favorite ? t("vault.form.favoriteOn") : t("vault.favorite")}
              aria-label={t("vault.favorite")}
            >
              <StarIcon />
            </button>
          </div>
        </div>

        {entry.type !== "note" && (
          <fieldset className="vault-box">
            <legend>{t(details[entry.type])}</legend>
            {entry.type === "login" && (
              <>
                <label className="form-field">
                  <span className="field-label">{t("vault.field.username")}</span>
                  <input
                    type="text"
                    className="ltr-field"
                    spellCheck={false}
                    autoComplete="off"
                    value={entry.username}
                    onChange={(event) => set("username", event.target.value)}
                  />
                </label>
                <PasswordInput
                  label={t("vault.field.password")}
                  value={entry.password}
                  onChange={(v) => set("password", v)}
                />
                <label className="form-field">
                  <span className="field-label">{t("vault.field.url")}</span>
                  <span className="input-with-icon">
                    <GlobeIcon />
                    <input
                      type="url"
                      className="ltr-field"
                      placeholder="https://example.com"
                      value={entry.url}
                      onChange={(event) => set("url", event.target.value)}
                    />
                  </span>
                </label>
              </>
            )}

            {entry.type === "wifi" && (
              <>
                <label className="form-field">
                  <span className="field-label">{t("vault.field.network")}</span>
                  <span className="input-with-icon">
                    <WifiIcon />
                    <input
                      type="text"
                      className="ltr-field"
                      value={entry.username}
                      onChange={(event) => set("username", event.target.value)}
                    />
                  </span>
                </label>
                <PasswordInput
                  label={t("vault.field.password")}
                  value={entry.password}
                  onChange={(v) => set("password", v)}
                />
              </>
            )}

            {entry.type === "card" && (
              <>
                <label className="form-field">
                  <span className="field-label">{t("vault.field.cardholder")}</span>
                  <input
                    type="text"
                    value={entry.extra.holder ?? ""}
                    onChange={(event) => setExtra("holder", event.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">{t("vault.field.cardNumber")}</span>
                  <span className="input-with-icon">
                    <CreditCardIcon />
                    <input
                      type="text"
                      inputMode="numeric"
                      className="ltr-field mono"
                      autoComplete="off"
                      placeholder="0000 0000 0000 0000"
                      value={entry.extra.number ?? ""}
                      onChange={(event) =>
                        setExtra(
                          "number",
                          event.target.value
                            .replace(/[^\d]/g, "")
                            .slice(0, 19)
                            .replace(/(\d{4})(?=\d)/g, "$1 "),
                        )
                      }
                    />
                  </span>
                </label>
                <div className="vault-pair">
                  <label className="form-field">
                    <span className="field-label">{t("vault.field.expiry")}</span>
                    <input
                      type="text"
                      className="ltr-field mono"
                      placeholder="MM/YY"
                      maxLength={7}
                      value={entry.extra.expiry ?? ""}
                      onChange={(event) => setExtra("expiry", event.target.value)}
                    />
                  </label>
                  <PasswordInput
                    label={t("vault.field.cvv")}
                    value={entry.password}
                    onChange={(v) => set("password", v)}
                    generator={false}
                  />
                </div>
              </>
            )}
          </fieldset>
        )}

        <label className="form-field">
          <span className="field-label">
            {entry.type === "note" ? t("vault.field.secret") : t("vault.field.notes")}
          </span>
          <textarea
            rows={entry.type === "note" ? 8 : 3}
            maxLength={20000}
            value={entry.notes}
            onChange={(event) => set("notes", event.target.value)}
          />
        </label>

        <fieldset className="vault-box vault-organize" data-columns={projects.length > 0 ? 2 : 1}>
          <legend>{t("vault.form.organize")}</legend>
          <label className="form-field">
            <span className="field-label">{t("vault.field.folder")}</span>
            <span className="input-with-icon">
              <FolderIcon />
              <input
                type="text"
                list="vault-folders"
                maxLength={60}
                placeholder={t("vault.noFolder")}
                value={entry.folder}
                onChange={(event) => set("folder", event.target.value)}
              />
            </span>
            <datalist id="vault-folders">
              {folders.map((folder) => (
                <option key={folder} value={folder} />
              ))}
            </datalist>
          </label>
          {projects.length > 0 && (
            <label className="form-field">
              <span className="field-label">{t("projects.linkedProject")}</span>
              <select
                value={entry.project_id ?? ""}
                onChange={(event) =>
                  setEntry({ ...entry, project_id: event.target.value ? Number(event.target.value) : null })
                }
              >
                <option value="">{t("projects.noProject")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.icon} {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
