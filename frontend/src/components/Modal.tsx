/**
 * Accessible modal dialog rendered in a portal: closes on Escape and backdrop click,
 * keeps focus inside, restores focus to the opener and locks page scrolling.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useI18n } from "../i18n";
import { CloseIcon, type IconComponent } from "./Icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  title: ReactNode;
  /** One short line under the title. */
  description?: ReactNode;
  icon?: IconComponent;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Hide the visible header (the title is still announced to screen readers). */
  bare?: boolean;
}

export function Modal({
  title,
  description,
  icon: TitleIcon,
  onClose,
  children,
  footer,
  size = "md",
  className = "",
  bare = false,
}: ModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
    first?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="overlay modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`dialog modal modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={bare ? "visually-hidden" : "modal-header"}>
          {TitleIcon && (
            <span className="modal-icon" aria-hidden="true">
              <TitleIcon />
            </span>
          )}
          <div className="modal-titles">
            <h2 id={titleId}>{title}</h2>
            {description && <p className="modal-description">{description}</p>}
          </div>
        </div>
        {!bare && (
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
