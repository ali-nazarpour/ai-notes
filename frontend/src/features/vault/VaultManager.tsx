/**
 * The unlocked password manager: filters (type, folder, health), search, list and detail.
 * Items are decrypted in memory; every save re-encrypts the item before it is sent.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { vaultApi } from "../../api/endpoints";
import { queryKeys } from "../../api/queries";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  AlertIcon,
  BackIcon,
  ClockIcon,
  CopyIcon,
  DiceIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GlobeIcon,
  InboxIcon,
  KeyIcon,
  LockIcon,
  MoreIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { EmptyState, Popover, Skeleton } from "../../components/ui";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { passwordStrength } from "../../lib/passwords";
import {
  createKeyMaterial,
  decryptJson,
  encryptJson,
  unlockKey,
  WrongMasterPasswordError,
} from "../../lib/vaultCrypto";
import { AUTO_LOCK_KEY, AUTO_LOCK_OPTIONS, vaultSession } from "../../store/vaultSession";
import type { User, VaultEntry, VaultRecord, VaultStatus } from "../../types";
import { PasswordGenerator, StrengthMeter } from "./PasswordGenerator";
import { emptyEntry, TYPES, VaultItemForm } from "./VaultItemForm";

type Filter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "type"; type: VaultEntry["type"] }
  | { kind: "folder"; folder: string }
  | { kind: "weak" }
  | { kind: "reused" }
  | { kind: "old" };

const YEAR = 365 * 24 * 60 * 60 * 1000;
const COLORS = ["#4f5bd5", "#0f9d8f", "#e0453f", "#d99400", "#8b4fd1", "#1f7ae0", "#d6417e", "#2f9e5a"];

function tileColor(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function useCopy() {
  const { t } = useI18n();
  const toast = useToast();
  return async (text: string, secret = false) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(secret ? t("vault.copiedSecret") : t("common.copied"), "success");
      if (secret) {
        // Clear the clipboard after 30 s, unless something else was copied meanwhile.
        setTimeout(async () => {
          try {
            if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText("");
          } catch {
            // Reading the clipboard needs permission; then it is simply left as is.
          }
        }, 30_000);
      }
    } catch {
      toast(t("errors.unknown"), "error");
    }
  };
}

function ItemTile({ record }: { record: VaultRecord }) {
  const TypeIcon = TYPES.find((item) => item.type === record.type)?.icon ?? KeyIcon;
  const letter = (record.title.trim()[0] ?? "?").toUpperCase();
  return (
    <span className="vault-tile" style={{ background: tileColor(record.title) }} aria-hidden="true">
      {record.type === "login" ? letter : <TypeIcon />}
    </span>
  );
}

function SecretField({
  label,
  value,
  mono = true,
  secret = false,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const copy = useCopy();
  const [visible, setVisible] = useState(!secret);
  if (!value) return null;
  return (
    <div className="vault-field">
      <span className="vault-field-label">{label}</span>
      <div className="vault-field-value">
        <span className={mono ? "mono" : undefined} dir={mono ? "ltr" : "auto"}>
          {visible ? value : "•".repeat(Math.min(value.length, 16))}
        </span>
        <span className="vault-field-actions">
          {secret && (
            <button
              type="button"
              className="icon-button small"
              onClick={() => setVisible(!visible)}
              aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
              title={visible ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {visible ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          )}
          <button
            type="button"
            className="icon-button small"
            onClick={() => void copy(value, secret)}
            aria-label={t("vault.copyField", { field: label })}
            title={t("common.copy")}
          >
            <CopyIcon />
          </button>
        </span>
      </div>
      {children}
    </div>
  );
}

function ItemDetail({
  record,
  reused,
  onEdit,
  onDelete,
  onToggleFavorite,
  onBack,
}: {
  record: VaultRecord;
  reused: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onBack: () => void;
}) {
  const { t, calendar } = useI18n();
  const href = record.url ? safeHref(record.url) : null;
  const strength = passwordStrength(record.password);
  const old = record.password && Date.now() - Date.parse(record.password_changed_at) > YEAR;
  const typeLabel = TYPES.find((item) => item.type === record.type)?.label ?? "vault.type.login";

  return (
    <article className="vault-detail card">
      <header className="vault-detail-header">
        <button
          type="button"
          className="icon-button vault-back"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <BackIcon />
        </button>
        <ItemTile record={record} />
        <div className="vault-detail-title">
          <h2 dir="auto">{record.title}</h2>
          <span className="muted small">
            {t(typeLabel)}
            {record.folder && ` · ${record.folder}`}
          </span>
        </div>
        <button
          type="button"
          className="icon-button favorite-button"
          aria-pressed={record.favorite}
          onClick={onToggleFavorite}
          aria-label={record.favorite ? t("notes.unfavorite") : t("notes.favorite")}
        >
          <StarIcon filled={record.favorite} />
        </button>
        <button type="button" className="small" onClick={onEdit}>
          <EditIcon /> {t("common.edit")}
        </button>
      </header>

      {(strength.level < 2 && record.password && record.type !== "card") || reused || old ? (
        <div className="vault-warnings">
          {strength.level < 2 && record.password && record.type !== "card" && (
            <span className="vault-warning">
              <AlertIcon /> {t("vault.health.weakOne")}
            </span>
          )}
          {reused && (
            <span className="vault-warning">
              <RefreshIcon /> {t("vault.health.reusedOne")}
            </span>
          )}
          {old && (
            <span className="vault-warning">
              <ClockIcon /> {t("vault.health.oldOne")}
            </span>
          )}
        </div>
      ) : null}

      <div className="vault-fields">
        {record.type === "card" ? (
          <>
            <SecretField label={t("vault.field.cardholder")} value={record.extra.holder ?? ""} mono={false} />
            <SecretField label={t("vault.field.cardNumber")} value={record.extra.number ?? ""} secret />
            <SecretField label={t("vault.field.expiry")} value={record.extra.expiry ?? ""} />
            <SecretField label={t("vault.field.cvv")} value={record.password} secret />
          </>
        ) : (
          <>
            <SecretField
              label={record.type === "wifi" ? t("vault.field.network") : t("vault.field.username")}
              value={record.username}
            />
            <SecretField label={t("vault.field.password")} value={record.password} secret>
              {record.type !== "note" && <StrengthMeter password={record.password} />}
            </SecretField>
          </>
        )}
        {record.url && (
          <div className="vault-field">
            <span className="vault-field-label">{t("vault.field.url")}</span>
            <div className="vault-field-value">
              <span dir="ltr">{hostOf(record.url)}</span>
              {href && (
                <a
                  className="icon-button small"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("vault.openSite")}
                >
                  <GlobeIcon />
                </a>
              )}
            </div>
          </div>
        )}
        {record.notes && (
          <div className="vault-field">
            <span className="vault-field-label">
              {record.type === "note" ? t("vault.field.secret") : t("vault.field.notes")}
            </span>
            <p className="vault-notes" dir="auto">
              {record.notes}
            </p>
          </div>
        )}
      </div>

      <footer className="vault-detail-footer">
        <span className="muted small">
          {t("vault.updated", { date: calendar.dateTime(record.updated_at) })}
          {record.password &&
            ` · ${t("vault.passwordChanged", { date: calendar.dateTime(record.password_changed_at) })}`}
        </span>
        <button type="button" className="ghost small danger" onClick={onDelete}>
          <TrashIcon /> {t("common.delete")}
        </button>
      </footer>
    </article>
  );
}

function ChangeMasterDialog({
  status,
  records,
  user,
  onClose,
}: {
  status: VaultStatus;
  records: VaultRecord[];
  user: User;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weak = passwordStrength(next).level < 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== repeat || weak) return;
    setBusy(true);
    setError(null);
    try {
      await unlockKey(current, status);
      const { key, setup } = await createKeyMaterial(next);
      const items = await Promise.all(
        records.map(async ({ id, created_at: _c, updated_at: _u, ...entry }) => ({
          id,
          data: await encryptJson(key, entry),
        })),
      );
      await vaultApi.rekey({ ...setup, items });
      vaultSession.unlock(user.id, key);
      await client.invalidateQueries({ queryKey: queryKeys.vaultStatus });
      toast(t("vault.masterChanged"), "success");
      onClose();
    } catch (err) {
      setError(err instanceof WrongMasterPasswordError ? t("vault.wrongMaster") : errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("vault.changeMaster")}
      icon={KeyIcon}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="vault-rekey"
            className="primary"
            disabled={busy || weak || next !== repeat || !current}
          >
            {busy ? t("common.saving") : t("vault.changeMaster")}
          </button>
        </>
      }
    >
      <form id="vault-rekey" className="stack" onSubmit={submit}>
        <label className="form-field">
          <span className="field-label">{t("vault.currentMaster")}</span>
          <input
            type="password"
            data-autofocus
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="form-field">
          <span className="field-label">{t("vault.newMaster")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <StrengthMeter password={next} />
        </label>
        <label className="form-field">
          <span className="field-label">{t("security.repeatPassword")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          {repeat && repeat !== next && <span className="error-hint">{t("security.mismatch")}</span>}
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function VaultManager({
  user,
  cryptoKey,
  status,
  title,
}: {
  user: User;
  cryptoKey: CryptoKey;
  status: VaultStatus;
  title: ReactNode;
}) {
  const i18n = useI18n();
  const { t, calendar, plural } = i18n;
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const queryKey = ["vault-items", user.id, status.salt] as const;
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const search = usePageQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<VaultRecord | VaultEntry | null>(null);
  const [dialog, setDialog] = useState<"generator" | "master" | null>(null);
  const [autoLock, setAutoLock] = useLocalStorage<number>(AUTO_LOCK_KEY, 5);
  const [sort, setSort] = useLocalStorage<"title" | "updated">("notes.vaultSort", "title");

  const { data, isLoading } = useQuery({
    queryKey,
    staleTime: Infinity,
    queryFn: async () => {
      const encrypted = await vaultApi.items();
      let damaged = 0;
      const records: VaultRecord[] = [];
      for (const item of encrypted) {
        try {
          const entry = await decryptJson<VaultEntry>(cryptoKey, item.data);
          records.push({
            ...emptyEntry(entry.type ?? "login"),
            ...entry,
            id: item.id,
            created_at: item.created_at,
            updated_at: item.updated_at,
          });
        } catch {
          damaged++;
        }
      }
      return { records, damaged };
    },
  });
  const records = useMemo(() => data?.records ?? [], [data]);

  const reusedIds = useMemo(() => {
    const byPassword = new Map<string, number[]>();
    for (const record of records) {
      if (!record.password || record.type === "card") continue;
      byPassword.set(record.password, [...(byPassword.get(record.password) ?? []), record.id]);
    }
    return new Set([...byPassword.values()].filter((ids) => ids.length > 1).flat());
  }, [records]);

  const isWeak = (r: VaultRecord) =>
    !!r.password && r.type !== "card" && passwordStrength(r.password).level < 2;
  const isOld = (r: VaultRecord) => !!r.password && Date.now() - Date.parse(r.password_changed_at) > YEAR;
  const folders = useMemo(
    () => [...new Set(records.map((r) => r.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [records],
  );

  const visible = useMemo(() => {
    return records
      .filter((r) => {
        switch (filter.kind) {
          case "favorites":
            return r.favorite;
          case "type":
            return r.type === filter.type;
          case "folder":
            return r.folder === filter.folder;
          case "weak":
            return isWeak(r);
          case "reused":
            return reusedIds.has(r.id);
          case "old":
            return isOld(r);
          default:
            return true;
        }
      })
      .filter((r) => matchesQuery(search, r.title, r.username, r.url, r.folder, r.notes))
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : Date.parse(b.updated_at) - Date.parse(a.updated_at),
      );
  }, [records, filter, search, sort, reusedIds]);

  const selected = records.find((r) => r.id === selectedId) ?? null;

  const setRecords = (update: (current: VaultRecord[]) => VaultRecord[]) =>
    client.setQueryData(queryKey, (old: typeof data) => ({
      records: update(old?.records ?? []),
      damaged: old?.damaged ?? 0,
    }));

  async function save(entry: VaultEntry, id?: number) {
    try {
      const encrypted = await encryptJson(cryptoKey, entry);
      const saved = id ? await vaultApi.update(id, encrypted) : await vaultApi.create(encrypted);
      const record: VaultRecord = {
        ...entry,
        id: saved.id,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
      };
      setRecords((current) => (id ? current.map((r) => (r.id === id ? record : r)) : [...current, record]));
      setSelectedId(saved.id);
      client.invalidateQueries({ queryKey: queryKeys.vaultStatus });
      toast(id ? t("settings.saved") : t("vault.added"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
      throw error;
    }
  }

  async function remove(record: VaultRecord) {
    const ok = await confirm({
      title: t("vault.deleteTitle"),
      message: t("vault.deleteMessage", { title: record.title }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await vaultApi.remove(record.id);
      setRecords((current) => current.filter((r) => r.id !== record.id));
      setSelectedId(null);
      client.invalidateQueries({ queryKey: queryKeys.vaultStatus });
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  const count = (predicate: (r: VaultRecord) => boolean) => records.filter(predicate).length;
  const filterItems: {
    filter: Filter;
    label: string;
    icon: () => React.JSX.Element;
    count: number;
    tone?: string;
  }[] = [
    { filter: { kind: "all" }, label: t("vault.filter.all"), icon: InboxIcon, count: records.length },
    {
      filter: { kind: "favorites" },
      label: t("notes.favorites"),
      icon: () => <StarIcon />,
      count: count((r) => r.favorite),
    },
    ...TYPES.map(({ type, label, icon }) => ({
      filter: { kind: "type", type } as Filter,
      label: t(label),
      icon,
      count: count((r) => r.type === type),
    })),
  ];
  const healthItems = [
    {
      filter: { kind: "weak" } as Filter,
      label: t("vault.health.weak"),
      icon: AlertIcon,
      count: count(isWeak),
    },
    {
      filter: { kind: "reused" } as Filter,
      label: t("vault.health.reused"),
      icon: RefreshIcon,
      count: reusedIds.size,
    },
    { filter: { kind: "old" } as Filter, label: t("vault.health.old"), icon: ClockIcon, count: count(isOld) },
  ];
  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);
  const healthy = healthItems.every((item) => item.count === 0);
  const withPassword = records.filter((r) => !!r.password);
  const atRisk = withPassword.filter((r) => isWeak(r) || reusedIds.has(r.id) || isOld(r)).length;
  const score = withPassword.length
    ? Math.round(((withPassword.length - atRisk) / withPassword.length) * 100)
    : 100;

  return (
    <section className="vault" data-detail-open={selected !== null} aria-labelledby="vault-title">
      <header className="vault-header">
        <div>
          <h1 id="vault-title" className="with-icon">
            {title}
          </h1>
          <p className="page-subtitle">
            <LockIcon /> {t("vault.encryptedNote")}
          </p>
        </div>
        <div className="page-actions">
          <Popover
            label={t("vault.newItem")}
            align="end"
            trigger={({ open, toggle }) => (
              <button type="button" className="primary" aria-expanded={open} onClick={toggle}>
                <PlusIcon /> {t("vault.newItem")}
              </button>
            )}
          >
            {(close) => (
              <div className="menu-list" role="menu">
                {TYPES.map(({ type, label, icon: TypeIcon }) => (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      close();
                      setEditing(emptyEntry(type));
                    }}
                  >
                    <TypeIcon /> {t(label)}
                  </button>
                ))}
              </div>
            )}
          </Popover>
          <button type="button" onClick={() => vaultSession.lock()} title={t("vault.lockNow")}>
            <LockIcon /> <span className="hide-on-phone">{t("vault.lock")}</span>
          </button>
          <Popover
            label={t("common.more")}
            align="end"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="icon-button"
                aria-expanded={open}
                aria-label={t("common.more")}
                onClick={toggle}
              >
                <MoreIcon />
              </button>
            )}
          >
            {(close) => (
              <div className="menu-list" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    close();
                    setDialog("generator");
                  }}
                >
                  <DiceIcon /> {t("vault.generator")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    close();
                    setDialog("master");
                  }}
                >
                  <KeyIcon /> {t("vault.changeMaster")}
                </button>
                <div className="menu-separator" />
                <p className="menu-heading">{t("vault.autoLock")}</p>
                <div className="menu-chips">
                  {AUTO_LOCK_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className="mini-chip"
                      aria-pressed={autoLock === minutes}
                      onClick={() => setAutoLock(minutes)}
                    >
                      {t("vault.minutes", { count: minutes })}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Popover>
        </div>
      </header>

      {records.length > 0 && (
        <div className="vault-overview">
          <div className="vault-score" data-level={score >= 90 ? "good" : score >= 60 ? "ok" : "bad"}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r="18" className="ring-track" />
              <circle
                cx="22"
                cy="22"
                r="18"
                className="ring-value"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={2 * Math.PI * 18 * (1 - score / 100)}
              />
            </svg>
            <span className="vault-score-value">{calendar.formatNumber(score)}</span>
            <span className="vault-score-text">
              <strong>{t("vault.score")}</strong>
              <span className="muted small">
                {atRisk ? t("vault.scoreRisk", { count: atRisk }) : t("vault.health.good")}
              </span>
            </span>
          </div>
          {TYPES.map(({ type, label, icon: TypeIcon }) => {
            const n = count((r) => r.type === type);
            return n ? (
              <button
                key={type}
                type="button"
                className="vault-stat"
                data-type={type}
                aria-pressed={same(filter, { kind: "type", type })}
                onClick={() => setFilter({ kind: "type", type })}
              >
                <TypeIcon />
                <strong>{calendar.formatNumber(n)}</strong>
                <span className="muted small">{t(label)}</span>
              </button>
            ) : null;
          })}
        </div>
      )}

      <div className="vault-layout">
        <nav className="vault-filters" aria-label={t("vault.filters")}>
          {filterItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className="vault-filter"
              aria-pressed={same(filter, item.filter)}
              onClick={() => {
                setFilter(item.filter);
                setSelectedId(null);
              }}
            >
              <item.icon />
              <span>{item.label}</span>
              <span className="nav-count">{calendar.formatNumber(item.count)}</span>
            </button>
          ))}
          {folders.length > 0 && <p className="vault-filter-heading">{t("vault.folders")}</p>}
          {folders.map((folder) => (
            <button
              key={folder}
              type="button"
              className="vault-filter"
              aria-pressed={same(filter, { kind: "folder", folder })}
              onClick={() => setFilter({ kind: "folder", folder })}
            >
              <FolderIcon />
              <span dir="auto">{folder}</span>
              <span className="nav-count">{calendar.formatNumber(count((r) => r.folder === folder))}</span>
            </button>
          ))}
          <p className="vault-filter-heading">{t("vault.health.title")}</p>
          {healthy ? (
            <p className="vault-healthy">{t("vault.health.good")}</p>
          ) : (
            healthItems
              .filter((item) => item.count > 0)
              .map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="vault-filter"
                  data-tone="warning"
                  aria-pressed={same(filter, item.filter)}
                  onClick={() => setFilter(item.filter)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                  <span className="nav-count">{calendar.formatNumber(item.count)}</span>
                </button>
              ))
          )}
        </nav>

        <div className="vault-list-pane">
          <div className="vault-search">
            <span className="vault-list-count">
              {search ? (
                <>
                  <SearchIcon /> {t("vault.resultsFor", { query: search })}
                </>
              ) : (
                plural("vault.itemCount", visible.length)
              )}
            </span>
            <select
              className="compact-select"
              aria-label={t("notes.sortBy")}
              value={sort}
              onChange={(event) => setSort(event.target.value as "title" | "updated")}
            >
              <option value="title">{t("notes.sort.title")}</option>
              <option value="updated">{t("notes.sort.updated")}</option>
            </select>
          </div>
          {isLoading ? (
            <Skeleton rows={5} height={56} />
          ) : visible.length ? (
            <ul className="vault-list">
              {visible.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    className="vault-row"
                    aria-current={record.id === selectedId}
                    onClick={() => setSelectedId(record.id)}
                  >
                    <ItemTile record={record} />
                    <span className="vault-row-text">
                      <strong dir="auto">{record.title}</strong>
                      <span className="muted small" dir="auto">
                        {record.type === "card"
                          ? `•••• ${(record.extra.number ?? "").replace(/\s/g, "").slice(-4)}`
                          : record.username ||
                            (record.url
                              ? hostOf(record.url)
                              : t(TYPES.find((x) => x.type === record.type)?.label ?? "vault.type.login"))}
                      </span>
                    </span>
                    {record.favorite && <StarIcon filled />}
                    {(isWeak(record) || reusedIds.has(record.id)) && (
                      <span className="vault-row-warning" title={t("vault.health.title")}>
                        <AlertIcon />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={KeyIcon}
              title={records.length ? t("vault.noResults") : t("vault.emptyTitle")}
              hint={records.length ? undefined : t("vault.emptyHint")}
              action={
                !records.length && (
                  <button type="button" className="primary" onClick={() => setEditing(emptyEntry("login"))}>
                    <PlusIcon /> {t("vault.addFirst")}
                  </button>
                )
              }
            />
          )}
          {(data?.damaged ?? 0) > 0 && (
            <p className="hint">{t("vault.damaged", { count: data?.damaged ?? 0 })}</p>
          )}
        </div>

        <div className="vault-detail-pane">
          {selected ? (
            <ItemDetail
              record={selected}
              reused={reusedIds.has(selected.id)}
              onEdit={() => setEditing(selected)}
              onDelete={() => void remove(selected)}
              onToggleFavorite={() => {
                const { id, created_at: _c, updated_at: _u, ...entry } = selected;
                void save({ ...entry, favorite: !selected.favorite }, id).catch(() => undefined);
              }}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="vault-placeholder">
              <KeyIcon />
              <p className="muted">{t("vault.selectHint")}</p>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <VaultItemForm
          initial={editing}
          folders={folders}
          onClose={() => setEditing(null)}
          onSave={async (entry) => {
            const id = "id" in editing ? editing.id : undefined;
            const { id: _i, created_at: _c, updated_at: _u, ...clean } = entry as VaultRecord;
            await save(clean, id);
          }}
        />
      )}
      {dialog === "generator" && (
        <Modal title={t("vault.generator")} icon={DiceIcon} onClose={() => setDialog(null)} size="sm">
          <PasswordGenerator
            onUse={(password) => {
              const copy = navigator.clipboard?.writeText(password);
              void copy?.then(() => toast(t("common.copied"), "success"));
              setDialog(null);
            }}
          />
        </Modal>
      )}
      {dialog === "master" && (
        <ChangeMasterDialog status={status} records={records} user={user} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}
