/**
 * Alarms: a live clock with the next alarm, the list of alarms (on/off switch, repeat,
 * next ring), and a dialog to create or edit one (time, one-time date or repeat days,
 * sound with preview, color, note). Alarms ring while the app is open (AlarmCenter).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { alarmsApi } from "../../api/v5";
import { DateInput } from "../../components/DatePicker";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  AlarmIcon,
  BellRingIcon,
  EditIcon,
  PlayFilledIcon,
  PlusIcon,
  RefreshIcon as RepeatIcon,
  SpeakerIcon,
  TrashIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { ColorPicker, EmptyState, PageHeader, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { addDays, today, toISODate } from "../../lib/calendar";
import { categoryStyle } from "../../lib/palette";
import type { Alarm, AlarmInput, AlarmRepeat, AlarmSound } from "../../types5";
import { alarmsKey, useAlarms, useScheduleOptions } from "./AlarmCenter";
import { nextRing, untilParts } from "./schedule";
import { playSound, unlockAudio } from "./sounds";

const REPEATS: AlarmRepeat[] = ["once", "daily", "weekdays", "weekly", "monthly"];
const SOUNDS: AlarmSound[] = ["chime", "bell", "soft", "beep", "digital"];

function useNow(interval = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

function useFormat() {
  const { t, calendar } = useI18n();
  const digits = (text: string) => text.replace(/\d/g, (d) => calendar.formatNumber(Number(d)));
  const weekday = useMemo(
    () => new Intl.DateTimeFormat(calendar.locale, { weekday: "short" }),
    [calendar.locale],
  );
  // 2024-01-07 was a Sunday: day index 0..6 -> a date with that weekday.
  const dayName = (index: number) => weekday.format(new Date(2024, 0, 7 + index));
  const until = (target: Date, now: Date) => {
    const { days, hours, minutes } = untilParts(target, now);
    if (days) return t("alarms.inDays", { d: days, h: hours });
    if (hours) return t("alarms.inHours", { h: hours, m: minutes });
    return t("alarms.inMinutes", { m: Math.max(1, minutes) });
  };
  const repeatText = (alarm: Pick<Alarm, "repeat" | "weekdays" | "date">) => {
    if (alarm.repeat === "once") return alarm.date ? calendar.longDay(alarm.date) : t("alarms.repeat.once");
    if (alarm.repeat === "weekly") return alarm.weekdays.map(dayName).join("، ") || t("alarms.repeat.weekly");
    if (alarm.repeat === "monthly" && alarm.date)
      return t("alarms.monthlyOn", { day: calendar.formatNumber(calendar.parts(alarm.date).day) });
    return t(`alarms.repeat.${alarm.repeat}` as TranslationKey);
  };
  return { digits, dayName, until, repeatText };
}

export function AlarmsPage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const query = usePageQuery();
  const [params, setParams] = useSearchParams();
  const { data: alarms = [], isLoading } = useAlarms();
  const options = useScheduleOptions();
  const now = useNow();
  const { digits, until, repeatText } = useFormat();
  const [editing, setEditing] = useState<Alarm | "new" | null>(null);
  const [permission, setPermission] = useState(() =>
    "Notification" in window ? Notification.permission : "denied",
  );

  // Links from the search open an alarm.
  useEffect(() => {
    if (params.get("new")) {
      setEditing("new");
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
      return;
    }
    const id = Number(params.get("alarm"));
    const alarm = id ? alarms.find((a) => a.id === id) : undefined;
    if (alarm) {
      setEditing(alarm);
      const next = new URLSearchParams(params);
      next.delete("alarm");
      setParams(next, { replace: true });
    }
  }, [params, alarms, setParams]);

  const upcoming = useMemo(
    () =>
      alarms
        .map((alarm) => ({ alarm, next: nextRing(alarm, now, options) }))
        .sort(
          (a, b) =>
            (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity) ||
            a.alarm.time.localeCompare(b.alarm.time),
        ),
    [alarms, now, options],
  );
  const shown = upcoming.filter(({ alarm }) => matchesQuery(query, alarm.title, alarm.note));
  const first = upcoming.find((u) => u.next);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      await client.invalidateQueries({ queryKey: alarmsKey });
    }
  }

  const clock = digits(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  const seconds = digits(String(now.getSeconds()).padStart(2, "0"));

  return (
    <div className="page alarms-page">
      <PageHeader
        title={t("nav.alarms")}
        subtitle={t("alarms.subtitle")}
        actions={
          <button
            type="button"
            className="primary"
            onClick={() => {
              unlockAudio();
              setEditing("new");
            }}
          >
            <PlusIcon /> {t("alarms.new")}
          </button>
        }
      />

      <section className="alarm-hero">
        <div className="alarm-clock" aria-live="off">
          <span className="alarm-clock-time">
            {clock}
            <small>{seconds}</small>
          </span>
          <span className="alarm-clock-date">{calendar.longDay(toISODate(now))}</span>
        </div>
        <div className="alarm-next">
          {first?.next ? (
            <>
              <span className="alarm-next-label">
                <BellRingIcon /> {t("alarms.nextAlarm")}
              </span>
              <strong dir="auto">{first.alarm.title}</strong>
              <span>
                {digits(first.alarm.time)} · {until(first.next, now)}
              </span>
            </>
          ) : (
            <span className="alarm-next-label">{t("alarms.noneUpcoming")}</span>
          )}
        </div>
      </section>

      {permission !== "granted" && "Notification" in window && (
        <div className="alarm-permission">
          <BellRingIcon />
          <span>
            <strong>{t("alarms.notifyTitle")}</strong>
            <span className="muted small">
              {permission === "denied" ? t("alarms.notifyDenied") : t("alarms.notifyHint")}
            </span>
          </span>
          {permission === "default" && (
            <button
              type="button"
              className="small"
              onClick={() => void Notification.requestPermission().then(setPermission)}
            >
              {t("alarms.notifyAllow")}
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <Skeleton rows={3} height={92} />
      ) : !alarms.length ? (
        <EmptyState
          icon={AlarmIcon}
          title={t("alarms.empty")}
          hint={t("alarms.emptyHint")}
          action={
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              <PlusIcon /> {t("alarms.new")}
            </button>
          }
        />
      ) : (
        <div className="alarm-grid">
          {shown.map(({ alarm, next }) => (
            <article
              key={alarm.id}
              className="alarm-card"
              data-enabled={alarm.enabled}
              style={categoryStyle(alarm.color)}
            >
              <button type="button" className="alarm-card-main" onClick={() => setEditing(alarm)}>
                <span className="alarm-card-clock">
                  <span className="alarm-card-time">{digits(alarm.time)}</span>
                  <span className="alarm-card-icon" aria-hidden="true">
                    <AlarmIcon />
                  </span>
                </span>
                <span className="alarm-card-body">
                  <span className="alarm-card-title" dir="auto">
                    {alarm.title}
                  </span>
                  {alarm.note && (
                    <span className="alarm-card-note" dir="auto">
                      {alarm.note}
                    </span>
                  )}
                  <span className="alarm-card-chips">
                    <span className="alarm-chip">
                      <RepeatIcon /> {repeatText(alarm)}
                    </span>
                    <span className="alarm-chip">
                      <SpeakerIcon /> {t(`alarms.sound.${alarm.sound}`)}
                    </span>
                    <span className="alarm-chip alarm-chip-next" data-off={!next}>
                      <BellRingIcon />{" "}
                      {next ? until(next, now) : alarm.enabled ? t("alarms.noMore") : t("alarms.off")}
                    </span>
                  </span>
                </span>
              </button>
              <label className="switch" aria-label={alarm.enabled ? t("alarms.turnOff") : t("alarms.turnOn")}>
                <input
                  type="checkbox"
                  checked={alarm.enabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    let changes: Partial<AlarmInput> = { enabled };
                    // Turning a past one-time alarm back on moves it to its next time.
                    if (enabled && alarm.repeat === "once" && alarm.date) {
                      const at = new Date(`${alarm.date}T${alarm.time}:00`);
                      if (at <= new Date()) {
                        const todayAt = new Date(`${today()}T${alarm.time}:00`);
                        changes = { enabled, date: todayAt > new Date() ? today() : addDays(today(), 1) };
                      }
                    }
                    void run(() => alarmsApi.update(alarm.id, changes));
                  }}
                />
                <span aria-hidden="true" />
              </label>
              <div className="alarm-card-actions">
                <button
                  type="button"
                  className="icon-button small"
                  onClick={() => setEditing(alarm)}
                  aria-label={t("common.edit")}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="icon-button small danger"
                  aria-label={t("common.delete")}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("alarms.deleteTitle", { title: alarm.title }),
                        confirmLabel: t("common.delete"),
                        danger: true,
                      })
                    )
                      void run(() => alarmsApi.remove(alarm.id));
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="hint alarm-foot">{t("alarms.openAppHint")}</p>

      {editing && <AlarmDialog alarm={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function defaultTime(): string {
  const date = new Date(Date.now() + 60 * 60_000);
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

export function AlarmDialog({
  alarm,
  onClose,
  initial,
}: {
  alarm: Alarm | null;
  onClose: () => void;
  initial?: Partial<AlarmInput>;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const toast = useToast();
  const client = useQueryClient();
  const { dayName } = useFormat();
  const [draft, setDraft] = useState<AlarmInput>(() => ({
    title: alarm?.title ?? "",
    note: alarm?.note ?? "",
    time: alarm?.time ?? defaultTime(),
    date: alarm?.date ?? null,
    repeat: alarm?.repeat ?? "once",
    weekdays: alarm?.weekdays ?? [],
    enabled: alarm?.enabled ?? true,
    sound: alarm?.sound ?? "chime",
    color: alarm?.color ?? "amber",
    link: alarm?.link ?? null,
    ...initial,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (changes: Partial<AlarmInput>) => setDraft((d) => ({ ...d, ...changes }));

  function quick(minutes: number) {
    const at = new Date(Date.now() + minutes * 60_000);
    set({
      time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
      date: toISODate(at),
      repeat: "once",
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    let body: AlarmInput = { ...draft, title: draft.title.trim(), enabled: true };
    if (body.repeat === "once") {
      // Without a date: today if the time is still ahead, otherwise tomorrow.
      const date = body.date ?? today();
      const at = new Date(`${date}T${body.time}:00`);
      body = { ...body, date: at > new Date() || body.date ? date : addDays(today(), 1) };
    }
    if (body.repeat === "weekly" && !body.weekdays.length) body.weekdays = [new Date().getDay()];
    if (body.repeat === "monthly" && !body.date) body.date = today();
    setBusy(true);
    setError(null);
    try {
      if (alarm) await alarmsApi.update(alarm.id, body);
      else await alarmsApi.create(body);
      await client.invalidateQueries({ queryKey: alarmsKey });
      toast(alarm ? t("settings.saved") : t("alarms.created"), "success");
      onClose();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  const order = i18n.language === "fa" ? [6, 0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0];

  return (
    <Modal
      title={alarm ? t("alarms.edit") : t("alarms.new")}
      description={t("alarms.dialogHint")}
      icon={AlarmIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="alarm-form" className="primary" disabled={busy || !draft.title.trim()}>
            {alarm ? t("common.save") : t("alarms.set")}
          </button>
        </>
      }
    >
      <form id="alarm-form" className="alarm-form" onSubmit={submit}>
        <div className="alarm-form-time" style={categoryStyle(draft.color)}>
          <input
            type="time"
            className="alarm-time-input"
            required
            value={draft.time}
            onChange={(event) => set({ time: event.target.value })}
            aria-label={t("alarms.time")}
            dir="ltr"
          />
          <div className="chips">
            {[10, 30, 60, 120].map((m) => (
              <button key={m} type="button" className="chip" onClick={() => quick(m)}>
                {m < 60 ? t("alarms.plusMinutes", { n: m }) : t("alarms.plusHours", { n: m / 60 })}
              </button>
            ))}
          </div>
          <ColorPicker
            label={t("categories.color")}
            size="sm"
            value={draft.color}
            onChange={(color) => set({ color })}
          />
        </div>
        <div className="stack">
          <label className="field">
            <span className="field-label">{t("alarms.titleLabel")}</span>
            <input
              type="text"
              dir="auto"
              data-autofocus
              maxLength={200}
              required
              placeholder={t("alarms.titlePlaceholder")}
              value={draft.title}
              onChange={(event) => set({ title: event.target.value })}
            />
          </label>
          <div className="field">
            <span className="field-label">{t("alarms.repeat")}</span>
            <div className="segmented scroll" role="radiogroup">
              {REPEATS.map((repeat) => (
                <button
                  key={repeat}
                  type="button"
                  role="radio"
                  aria-checked={draft.repeat === repeat}
                  aria-pressed={draft.repeat === repeat}
                  onClick={() => set({ repeat })}
                >
                  {t(`alarms.repeat.${repeat}`)}
                </button>
              ))}
            </div>
          </div>
          {draft.repeat === "weekly" && (
            <div className="weekday-picker" role="group" aria-label={t("alarms.days")}>
              {order.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={draft.weekdays.includes(day)}
                  onClick={() =>
                    set({
                      weekdays: draft.weekdays.includes(day)
                        ? draft.weekdays.filter((d) => d !== day)
                        : [...draft.weekdays, day],
                    })
                  }
                >
                  {dayName(day)}
                </button>
              ))}
            </div>
          )}
          {(draft.repeat === "once" || draft.repeat === "monthly") && (
            <div className="field">
              <span className="field-label">
                {draft.repeat === "once" ? t("alarms.date") : t("alarms.dayOfMonth")}
              </span>
              <DateInput
                label={t("alarms.date")}
                value={draft.date}
                onChange={(date) => set({ date })}
                min={today()}
                placeholder={t("alarms.datePlaceholder")}
              />
            </div>
          )}
          <div className="field">
            <span className="field-label">{t("alarms.sound")}</span>
            <div className="sound-picker">
              {SOUNDS.map((sound) => (
                <button
                  key={sound}
                  type="button"
                  aria-pressed={draft.sound === sound}
                  onClick={() => {
                    set({ sound });
                    playSound(sound);
                  }}
                >
                  <PlayFilledIcon /> {t(`alarms.sound.${sound}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">{t("alarms.note")}</span>
            <textarea
              rows={2}
              dir="auto"
              maxLength={1000}
              placeholder={t("alarms.notePlaceholder")}
              value={draft.note}
              onChange={(event) => set({ note: event.target.value })}
            />
          </label>
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
