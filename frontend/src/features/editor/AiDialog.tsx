/**
 * AI writing help inside the editor: rewrite a selection, translate it, continue writing,
 * or write from an instruction. The result is previewed first; nothing changes until the
 * user chooses Replace or Insert.
 */
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { aiApi } from "../../api/endpoints";
import { CloseIcon, CopyIcon, RefreshIcon, SparkleIcon } from "../../components/Icons";
import { Spinner } from "../../components/ui";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { translationLanguage } from "../../lib/languages";
import { markdownToContent } from "../../lib/markdown";
import type { EditAction, EditRequest } from "../../types";

export type AiRequest =
  | { kind: "edit"; action: EditAction; text: string; from: number; to: number; targetLanguage?: string }
  | { kind: "continue"; at: number; context: string }
  | { kind: "write"; at: number; context: string };

export const ACTION_LABELS: Record<EditAction, TranslationKey> = {
  improve: "ai.action.improve",
  fix: "ai.action.fix",
  shorter: "ai.action.shorter",
  longer: "ai.action.longer",
  simplify: "ai.action.simplify",
  professional: "ai.action.professional",
  friendly: "ai.action.friendly",
  translate: "ai.action.translate",
  continue: "ai.continue",
  custom: "ai.action.custom",
};

function blockEnd(editor: Editor, position: number): number {
  const resolved = editor.state.doc.resolve(Math.min(position, editor.state.doc.content.size));
  return resolved.depth >= 1 ? resolved.after(1) : position;
}

export function AiDialog({
  editor,
  request,
  onClose,
}: {
  editor: Editor;
  request: AiRequest;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const needsInstruction =
    request.kind === "write" || (request.kind === "edit" && request.action === "custom");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    let body: EditRequest;
    if (request.kind === "edit") {
      body = {
        action: request.action,
        text: request.text,
        instruction: request.action === "custom" ? instruction : undefined,
        target_language: request.targetLanguage,
      };
    } else if (request.kind === "continue") {
      body = { action: "continue", text: "", context: request.context };
    } else {
      body = { action: "custom", text: "", instruction, context: request.context };
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult((await aiApi.edit(body)).result);
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setLoading(false);
    }
  }, [request, instruction, i18n]);

  useEffect(() => {
    if (!needsInstruction && !started.current) {
      started.current = true;
      void run();
    }
  }, [needsInstruction, run]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function apply(mode: "replace" | "insert") {
    if (!result) return;
    const content = markdownToContent(result);
    const chain = editor.chain().focus();
    if (request.kind === "edit" && mode === "replace") {
      const inline = content.length === 1 && content[0].type === "paragraph";
      chain
        .insertContentAt(
          { from: request.from, to: request.to },
          inline ? (content[0].content ?? []) : content,
        )
        .run();
    } else {
      const anchor = request.kind === "edit" ? request.to : request.at;
      chain.insertContentAt(blockEnd(editor, anchor), content).run();
    }
    onClose();
  }

  let heading = t("ai.write");
  if (request.kind === "continue") heading = t("ai.continue");
  if (request.kind === "edit") {
    heading =
      request.action === "translate" && request.targetLanguage
        ? t("ai.translateTo", { language: translationLanguage(request.targetLanguage).native })
        : t(ACTION_LABELS[request.action]);
  }

  const submitInstruction = (event: FormEvent) => {
    event.preventDefault();
    if (instruction.trim()) void run();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="ai-dialog-title">
            <SparkleIcon /> {heading}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        {needsInstruction && (
          <form className="inline-form" onSubmit={submitInstruction}>
            <input
              type="text"
              autoFocus
              maxLength={1000}
              placeholder={request.kind === "write" ? t("ai.writePlaceholder") : t("ai.customPlaceholder")}
              aria-label={t("ai.instruction")}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={loading}
            />
            <button type="submit" className="primary" disabled={loading || !instruction.trim()}>
              {t("ai.generate")}
            </button>
          </form>
        )}

        {loading && <Spinner label={t("ai.working")} />}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {result && (
          <>
            <div className="ai-preview" dir="auto">
              {result}
            </div>
            <p className="hint">{t("ai.reviewHint")}</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => void run()}>
                <RefreshIcon /> {t("ai.retry")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void navigator.clipboard?.writeText(result).catch(() => undefined)}
              >
                <CopyIcon /> {t("common.copy")}
              </button>
              {request.kind === "edit" ? (
                <>
                  <button type="button" onClick={() => apply("insert")}>
                    {t("ai.insertBelow")}
                  </button>
                  <button type="button" className="primary" onClick={() => apply("replace")}>
                    {t("ai.replace")}
                  </button>
                </>
              ) : (
                <button type="button" className="primary" onClick={() => apply("insert")}>
                  {t("ai.insert")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
