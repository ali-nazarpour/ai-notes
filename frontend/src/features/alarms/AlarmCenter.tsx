/**
 * Rings alarms while the app is open in any tab: checks every few seconds, plays the
 * alarm's sound until dismissed, shows a system notification when the tab is in the
 * background, and offers snooze. The server records each ring so it rings only once.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { ApiError } from "../../api/client";
import { alarmsApi } from "../../api/v5";
import { AlarmIcon, CheckIcon, SnoozeIcon } from "../../components/Icons";
import { useI18n } from "../../i18n";
import { toISODate } from "../../lib/calendar";
import { categoryStyle } from "../../lib/palette";
import type { Alarm } from "../../types5";
import { dueRing, type ScheduleOptions, WORKDAYS_EN, WORKDAYS_FA } from "./schedule";
import { loopSound, unlockAudio } from "./sounds";

export const alarmsKey = ["alarms"] as const;

export function useScheduleOptions(): ScheduleOptions {
  const { calendar, language } = useI18n();
  return useMemo(
    () => ({
      dayOfMonth: (date: Date) => calendar.parts(toISODate(date)).day,
      workdays: language === "fa" ? WORKDAYS_FA : WORKDAYS_EN,
    }),
    [calendar, language],
  );
}

export function useAlarms() {
  return useQuery({
    queryKey: alarmsKey,
    queryFn: alarmsApi.list,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

interface Ringing {
  alarm: Alarm;
  at: Date;
}

export function AlarmCenter() {
  const { t, calendar } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const options = useScheduleOptions();
  const { data: alarms = [] } = useAlarms();
  const [ringing, setRinging] = useState<Ringing[]>([]);
  const handling = useRef(new Set<string>());
  const stop = useRef<(() => void) | null>(null);

  // Any click prepares audio, so the alarm can play sound later.
  useEffect(() => {
    const prepare = () => unlockAudio();
    window.addEventListener("pointerdown", prepare, { once: true });
    return () => window.removeEventListener("pointerdown", prepare);
  }, []);

  const check = useCallback(async () => {
    const now = new Date();
    for (const alarm of alarms) {
      const due = dueRing(alarm, now, options);
      if (!due) continue;
      const key = `${alarm.id}:${due.getTime()}`;
      if (handling.current.has(key)) continue;
      handling.current.add(key);
      try {
        const updated = await alarmsApi.fired(alarm.id, due);
        client.setQueryData<Alarm[]>(alarmsKey, (list) =>
          list?.map((a) => (a.id === updated.id ? updated : a)),
        );
        setRinging((list) => [...list, { alarm, at: due }]);
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          const notification = new Notification(`⏰ ${alarm.title}`, {
            body: [alarm.time, alarm.note].filter(Boolean).join(" · "),
            tag: key,
            requireInteraction: true,
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      } catch (error) {
        // 409: another tab or device already rang it.
        if (!(error instanceof ApiError && error.status === 409)) handling.current.delete(key);
      }
    }
  }, [alarms, options, client]);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), 5000);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const current = ringing[0];
  useEffect(() => {
    if (!current) return;
    stop.current = loopSound(current.alarm.sound);
    return () => {
      stop.current?.();
      stop.current = null;
    };
  }, [current]);

  if (!current) return null;
  const { alarm } = current;

  const close = () => setRinging((list) => list.slice(1));
  const snooze = async (minutes: number) => {
    try {
      const updated = await alarmsApi.snooze(alarm.id, minutes);
      client.setQueryData<Alarm[]>(alarmsKey, (list) =>
        list?.map((a) => (a.id === updated.id ? updated : a)),
      );
    } finally {
      close();
    }
  };

  return createPortal(
    <div
      className="alarm-ring-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alarm-ring-title"
    >
      <div className="alarm-ring" style={categoryStyle(alarm.color)}>
        <div className="alarm-ring-pulse" aria-hidden="true">
          <span />
          <span />
          <span className="alarm-ring-icon">
            <AlarmIcon />
          </span>
        </div>
        <p className="alarm-ring-time">
          {alarm.time.replace(/\d/g, (d) => calendar.formatNumber(Number(d)))}
        </p>
        <h2 id="alarm-ring-title" dir="auto">
          {alarm.title}
        </h2>
        {alarm.note && (
          <p className="alarm-ring-note" dir="auto">
            {alarm.note}
          </p>
        )}
        <div className="alarm-ring-snooze">
          <span className="muted small">
            <SnoozeIcon /> {t("alarms.snooze")}
          </span>
          {[5, 10, 15, 30].map((minutes) => (
            <button key={minutes} type="button" onClick={() => void snooze(minutes)}>
              {t("alarms.minutesShort", { n: minutes })}
            </button>
          ))}
        </div>
        <div className="alarm-ring-actions">
          {alarm.link && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                close();
                navigate(alarm.link!);
              }}
            >
              {t("drive.open")}
            </button>
          )}
          <button type="button" className="primary alarm-dismiss" onClick={close} data-autofocus>
            <CheckIcon /> {t("alarms.dismiss")}
          </button>
        </div>
        {ringing.length > 1 && (
          <p className="muted small">{t("alarms.moreRinging", { n: ringing.length - 1 })}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
