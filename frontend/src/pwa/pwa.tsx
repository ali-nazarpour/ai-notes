/**
 * Progressive Web App support.
 *
 * - useInstallPrompt: the browser's "install app" prompt (Chrome/Edge), so Settings can
 *   offer an Install button. Once installed, the app opens in its own window from the
 *   desktop / Start menu / home screen icon.
 * - UpdatePrompt: when a new version has been downloaded by the service worker, offers a
 *   one-click reload instead of silently mixing old and new code.
 */
import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { RefreshIcon } from "../components/Icons";
import { useI18n } from "../i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((listener) => listener());
  });
}

export function isStandalone(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function useInstallPrompt() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    installed: isStandalone(),
    canInstall: deferredPrompt !== null,
    async install() {
      if (!deferredPrompt) return false;
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      listeners.forEach((listener) => listener());
      return outcome === "accepted";
    },
  };
}

export function UpdatePrompt() {
  const { t } = useI18n();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>{t("pwa.updateReady")}</span>
      <button type="button" className="primary small" onClick={() => void updateServiceWorker(true)}>
        <RefreshIcon /> {t("pwa.reload")}
      </button>
      <button type="button" className="ghost small" onClick={() => setNeedRefresh(false)}>
        {t("common.later")}
      </button>
    </div>
  );
}
