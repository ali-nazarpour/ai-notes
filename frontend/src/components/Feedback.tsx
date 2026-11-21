/**
 * App-wide feedback: toasts (short messages that disappear) and confirmation dialogs.
 *
 *   const toast = useToast();   toast("Saved")   toast(message, "error")
 *   const confirm = useConfirm();  if (await confirm({...})) { ... }
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./Icons";

type ToastType = "success" | "error" | "info";

interface ToastData {
  id: number;
  type: ToastType;
  text: string;
  action?: { label: string; run: () => void };
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ShowToast = (text: string, type?: ToastType, action?: ToastData["action"]) => void;

const ToastContext = createContext<ShowToast>(() => undefined);
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null);

  const show = useCallback<ShowToast>((text, type = "success", action) => {
    setToast({ id: Date.now(), type, text, action });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.type === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const close = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={show}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        {toast && (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            {toast.type === "error" ? <AlertIcon /> : <CheckIcon />}
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              className="icon-button small"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
            >
              <CloseIcon />
            </button>
          </div>
        )}
        {confirmState && <ConfirmDialog options={confirmState} onClose={close} />}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (value: boolean) => void }) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay confirm-overlay" onClick={() => onClose(false)}>
      <div
        className="dialog confirm-dialog"
        data-danger={!!options.danger}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="confirm-icon" aria-hidden="true">
          {options.danger ? <AlertIcon /> : <InfoIcon />}
        </span>
        <div className="confirm-text">
          <h2 id="confirm-title">{options.title}</h2>
          {options.message && <p className="muted">{options.message}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} onClick={() => onClose(false)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={options.danger ? "danger-solid" : "primary"}
            onClick={() => onClose(true)}
          >
            {options.confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
