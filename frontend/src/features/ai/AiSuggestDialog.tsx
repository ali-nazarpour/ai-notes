/**
 * Generic "suggest with AI" dialog: the user describes something, the local model
 * proposes a list (tasks, cards, pages, milestones, ...), the user ticks what to keep.
 */
import { useState, type FormEvent } from "react";

import { aiToolsApi } from "../../api/v4";
import { CheckIcon, SparkleIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { GenerateKind, GeneratedItem } from "../../types4";

export function AiSuggestDialog({
  kind,
  title,
  hint,
  placeholder,
  initialText = "",
  context = "",
  count = 6,
  showDates = false,
  confirmLabel,
  onAccept,
  onClose,
}: {
  kind: GenerateKind;
  title: string;
  hint?: string;
  placeholder?: string;
  initialText?: string;
  /** Extra text sent along (e.g. the project description). */
  context?: string;
  count?: number;
  showDates?: boolean;
  confirmLabel?: string;
  onAccept: (items: GeneratedItem[]) => Promise<void> | void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const [text, setText] = useState(initialText);
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await aiToolsApi.generate({
        kind,
        text: [text, context].filter(Boolean).join("\n\n"),
        count,
      });
      setItems(result.items);
      setPicked(new Set(result.items.map((_, index) => index)));
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    try {
      await onAccept(items.filter((_, index) => picked.has(index)));
      onClose();
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  const toggle = (index: number) => {
    const next = new Set(picked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setPicked(next);
  };

  return (
    <Modal
      title={title}
      icon={SparkleIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          {items.length > 0 && (
            <button
              type="button"
              className="primary"
              disabled={busy || !picked.size}
              onClick={() => void accept()}
            >
              <CheckIcon /> {confirmLabel ?? t("ai.addSelected", { count: picked.size })}
            </button>
          )}
        </>
      }
    >
      <div className="modal-split ai-suggest">
        <form className="stack" onSubmit={generate}>
          <label className="field">
            <span className="field-label">{t("ai.describe")}</span>
            <textarea
              data-autofocus
              rows={6}
              maxLength={6000}
              placeholder={placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          {hint && <p className="hint">{hint}</p>}
          <button type="submit" className="button" disabled={busy || (!text.trim() && !context.trim())}>
            <SparkleIcon />{" "}
            {busy && !items.length ? t("ai.thinking") : items.length ? t("ai.again") : t("ai.suggest")}
          </button>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <p className="hint">{t("ai.localNote")}</p>
        </form>
        <div className="ai-results">
          {busy && !items.length ? (
            <div className="ai-thinking">
              <span className="spinner" />
              <span>{t("ai.thinking")}</span>
            </div>
          ) : items.length ? (
            <ul className="suggestion-list">
              {items.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <label className="suggestion">
                    <input type="checkbox" checked={picked.has(index)} onChange={() => toggle(index)} />
                    <span>
                      <strong dir="auto">{item.title}</strong>
                      {item.detail && (
                        <span className="muted small" dir="auto">
                          {item.detail}
                        </span>
                      )}
                      {showDates && item.date && (
                        <span className="chip small">{calendar.shortDay(item.date)}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ai-placeholder">
              <SparkleIcon />
              <p className="muted">{t("ai.resultsHere")}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
