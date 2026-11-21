/**
 * Debounced saving of partial changes: changes are merged and sent `delay` ms after the
 * last edit, flushed when the tab is hidden or the component unmounts, and the browser
 * warns before closing with unsaved changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "saved" | "pending" | "saving" | "error";

export function useAutosave<T extends object>(save: (changes: Partial<T>) => Promise<unknown>, delay = 800) {
  const [state, setState] = useState<SaveState>("saved");
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changes = pending.current;
    if (!Object.keys(changes).length) return;
    pending.current = {};
    setState("saving");
    try {
      await saveRef.current(changes);
      setState(Object.keys(pending.current).length ? "pending" : "saved");
    } catch {
      pending.current = { ...changes, ...pending.current };
      setState("error");
    }
  }, []);

  const schedule = useCallback(
    (changes: Partial<T>, wait = delay) => {
      pending.current = { ...pending.current, ...changes };
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), wait);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  return { state, schedule, flush };
}
