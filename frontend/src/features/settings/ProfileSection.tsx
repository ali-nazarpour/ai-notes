/**
 * Profile: picture (cropped to 1:1 in the browser), personal details and contact details.
 * Changing the email asks for the current password.
 */
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { DateInput } from "../../components/DatePicker";

import { authApi, filesApi } from "../../api/endpoints";
import { useDataSummary } from "../../api/queries";
import { useToast } from "../../components/Feedback";
import {
  BoardIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircleIcon,
  MailIcon,
  MapPinIcon,
  NotesIcon,
  PhoneIcon,
  TrashIcon,
  UserIcon,
} from "../../components/Icons";
import { Avatar, displayName, fullName } from "../../components/ui";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { today } from "../../lib/calendar";
import { accountStore } from "../../store/accounts";
import type { User, UserChanges } from "../../types";
import { AvatarCropper } from "./AvatarCropper";

type ProfileDraft = Pick<
  User,
  "first_name" | "last_name" | "display_name" | "birth_date" | "bio" | "email" | "phone" | "address"
>;

function draftFrom(user: User): ProfileDraft {
  return {
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    display_name: user.display_name ?? "",
    birth_date: user.birth_date ?? null,
    bio: user.bio ?? "",
    email: user.email,
    phone: user.phone ?? "",
    address: user.address ?? "",
  };
}

export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

function Field({
  label,
  icon: FieldIcon,
  children,
  wide = false,
  hint,
}: {
  label: string;
  icon?: () => React.JSX.Element;
  children: ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  return (
    <label className={wide ? "form-field form-field-wide" : "form-field"}>
      <span className="field-label">
        {FieldIcon && <FieldIcon />}
        {label}
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
export function ProfileSection({ user }: { user: User }) {
  const i18n = useI18n();
  const { t, calendar, plural } = i18n;
  const toast = useToast();
  const { data: summary } = useDataSummary();
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(user));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const original = draftFrom(user);
  const changed = (Object.keys(draft) as (keyof ProfileDraft)[]).filter(
    (key) => (draft[key] ?? "") !== (original[key] ?? ""),
  );
  const emailChanged = draft.email.trim().toLowerCase() !== user.email;
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!changed.length) return;
    setBusy(true);
    const changes: UserChanges = {};
    for (const key of changed) Object.assign(changes, { [key]: draft[key] });
    if (emailChanged) changes.current_password = password;
    try {
      const updated = await authApi.updateMe(changes);
      accountStore.updateUser(updated);
      setDraft(draftFrom(updated));
      setPassword("");
      toast(t("settings.saved"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    } finally {
      setBusy(false);
    }
  }

  async function savePhoto(file: File) {
    setPhotoBusy(true);
    try {
      const stored = await filesApi.upload(file);
      accountStore.updateUser(await authApi.updateMe({ avatar: stored.url }));
      setCropping(null);
      toast(t("profile.photoUpdated"), "success");
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    try {
      accountStore.updateUser(await authApi.updateMe({ avatar: null }));
    } catch (error) {
      toast(errorMessage(error, i18n), "error");
    }
  }

  const age = user.birth_date ? ageOn(user.birth_date, today()) : null;
  // How much of the profile is filled in (shown on the personal card).
  const filled = [
    draft.first_name,
    draft.last_name,
    draft.display_name,
    draft.birth_date,
    draft.bio,
    draft.phone,
    draft.address,
    user.avatar,
  ];
  const completion = Math.round((filled.filter((v) => !!v && String(v).trim()).length / filled.length) * 100);
  const stats = [
    { icon: NotesIcon, value: summary?.notes, label: "nav.notes" as const },
    { icon: CheckCircleIcon, value: summary?.tasks, label: "nav.tasks" as const },
    { icon: BoardIcon, value: summary?.boards, label: "nav.boards" as const },
  ];

  return (
    <>
      <section className="card settings-card profile-hero">
        <div className="profile-banner" aria-hidden="true" />
        <div className="profile-hero-body">
          <div className="avatar-editor">
            <Avatar user={user} size="xl" />
            <button
              type="button"
              className="avatar-camera"
              onClick={() => fileInput.current?.click()}
              aria-label={t("profile.changePhoto")}
              title={t("profile.changePhoto")}
              disabled={photoBusy}
            >
              <CameraIcon />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) setCropping(file);
              }}
            />
          </div>
          <div className="profile-identity">
            <h2 dir="auto">{fullName(user) || displayName(user)}</h2>
            <p className="muted" dir="ltr">
              {user.email}
            </p>
            <p className="muted small">
              {t("settings.memberSince", { date: calendar.longDay(user.created_at.slice(0, 10)) })}
              {age !== null && ` · ${plural("profile.age", age)}`}
            </p>
            {user.bio && (
              <p className="profile-bio" dir="auto">
                {user.bio}
              </p>
            )}
          </div>
          <div className="profile-photo-actions">
            <button type="button" className="small" onClick={() => fileInput.current?.click()}>
              <CameraIcon /> {user.avatar ? t("profile.changePhoto") : t("profile.addPhoto")}
            </button>
            {user.avatar && (
              <button type="button" className="ghost small danger" onClick={() => void removePhoto()}>
                <TrashIcon /> {t("profile.removePhoto")}
              </button>
            )}
          </div>
        </div>
        <div className="profile-stats">
          {stats.map(({ icon: StatIcon, value, label }) => (
            <div key={label} className="profile-stat">
              <StatIcon />
              <strong>{value === undefined ? "–" : calendar.formatNumber(value)}</strong>
              <span>{t(label)}</span>
            </div>
          ))}
        </div>
      </section>

      <form className="settings-form" onSubmit={save}>
        <section className="card settings-card info-card" data-tone="violet">
          <div className="info-card-head">
            <span className="info-card-icon">
              <UserIcon />
            </span>
            <div className="info-card-titles">
              <h2 className="card-title">{t("profile.personal")}</h2>
              <p className="muted small">{t("profile.personalHint")}</p>
            </div>
            <div className="profile-complete" title={t("profile.completeHint")}>
              <span className="profile-complete-bar">
                <span style={{ width: `${completion}%` }} />
              </span>
              <span className="small">{t("profile.complete", { value: completion })}</span>
            </div>
          </div>
          <div className="form-grid">
            <Field label={t("profile.firstName")} icon={UserIcon}>
              <input
                type="text"
                maxLength={60}
                autoComplete="given-name"
                value={draft.first_name}
                onChange={(e) => set("first_name", e.target.value)}
              />
            </Field>
            <Field label={t("profile.lastName")}>
              <input
                type="text"
                maxLength={60}
                autoComplete="family-name"
                value={draft.last_name}
                onChange={(e) => set("last_name", e.target.value)}
              />
            </Field>
            <Field label={t("settings.displayName")} hint={t("profile.displayNameHint")}>
              <input
                type="text"
                maxLength={80}
                autoComplete="nickname"
                value={draft.display_name}
                onChange={(e) => set("display_name", e.target.value)}
              />
            </Field>
            <div className="form-field">
              <span className="field-label">
                <CalendarIcon />
                {t("profile.birthDate")}
              </span>
              <DateInput
                label={t("profile.birthDate")}
                value={draft.birth_date}
                onChange={(iso) => set("birth_date", iso)}
                min="1900-01-01"
                max={today()}
                startYear={calendar.parts(today()).year - 25}
                placeholder={t("profile.birthDatePlaceholder")}
              />
              {draft.birth_date && (
                <span className="hint">{plural("profile.age", ageOn(draft.birth_date, today()))}</span>
              )}
            </div>
            <Field label={t("profile.bio")} wide hint={t("profile.bioHint")}>
              <textarea
                rows={2}
                maxLength={300}
                value={draft.bio}
                onChange={(e) => set("bio", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="card settings-card info-card" data-tone="teal">
          <div className="info-card-head">
            <span className="info-card-icon">
              <MailIcon />
            </span>
            <div className="info-card-titles">
              <h2 className="card-title">{t("profile.contact")}</h2>
              <p className="muted small">{t("profile.contactHint")}</p>
            </div>
          </div>
          <div className="form-grid">
            <Field label={t("auth.email")} icon={MailIcon}>
              <input
                type="email"
                maxLength={254}
                autoComplete="email"
                required
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label={t("profile.phone")} icon={PhoneIcon}>
              <input
                type="tel"
                maxLength={30}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+98 912 345 6789"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            {emailChanged && (
              <Field label={t("settings.currentPassword")} wide hint={t("profile.emailPasswordHint")}>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            )}
            <Field label={t("profile.address")} icon={MapPinIcon} wide>
              <textarea
                rows={2}
                maxLength={300}
                autoComplete="street-address"
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <div className="form-savebar" data-visible={changed.length > 0}>
          <span className="muted small">{t("profile.unsaved")}</span>
          <button type="button" className="ghost" onClick={() => setDraft(original)}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="primary" disabled={busy || !changed.length}>
            {busy ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      </form>

      {cropping && <AvatarCropper file={cropping} onCancel={() => setCropping(null)} onDone={savePhoto} />}
    </>
  );
}
