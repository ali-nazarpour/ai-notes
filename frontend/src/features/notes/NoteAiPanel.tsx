/** AI tools for one note: summary, question, translation. Results can be inserted into the note. */
import { useState, type FormEvent } from "react";

import { aiApi } from "../../api/endpoints";
import {
  BrainIcon,
  ChatIcon,
  CloseIcon,
  CopyIcon,
  type IconComponent,
  SparkleIcon,
  TranslateIcon,
} from "../../components/Icons";
import { Spinner } from "../../components/ui";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import {
  LANGUAGE_KEY,
  QUICK_LANGUAGES,
  TRANSLATION_LANGUAGES,
  translationLanguage,
} from "../../lib/languages";

type Tool = "summarize" | "ask" | "translate";

const TOOLS: { tool: Tool; label: TranslationKey; icon: IconComponent }[] = [
  { tool: "summarize", label: "ai.summarize", icon: SparkleIcon },
  { tool: "ask", label: "ai.ask", icon: ChatIcon },
  { tool: "translate", label: "ai.translate", icon: TranslateIcon },
];

interface Result {
  label: string;
  text: string;
  note?: string;
}

export function NoteAiPanel({
  noteId,
  beforeRun,
  onInsert,
  onClose,
}: {
  noteId: number;
  /** Saves pending edits first, so the AI reads the latest text. */
  beforeRun: () => Promise<void>;
  onInsert: (markdown: string) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t, language: uiLanguage } = i18n;
  const [tool, setTool] = useState<Tool>("summarize");
  const [question, setQuestion] = useState("");
  const [thorough, setThorough] = useLocalStorage("notes.aiThorough", false);
  const [targetLanguage, setTargetLanguage] = useLocalStorage<string>(
    LANGUAGE_KEY,
    uiLanguage === "fa" ? "en" : "fa",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(action: () => Promise<Result>) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      await beforeRun();
      setResult(await action());
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setLoading(false);
    }
  }

  const summarize = () =>
    run(async () => {
      const response = await aiApi.summarize(noteId);
      return {
        label: t("ai.summary"),
        text: response.summary,
        note: response.chunks > 1 ? t("ai.summaryParts", { count: response.chunks }) : undefined,
      };
    });

  const ask = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    void run(async () => {
      const response = await aiApi.askNote(noteId, trimmed, thorough);
      return {
        label: trimmed,
        text: response.answer,
        note: response.partial ? t("ai.partialNote") : undefined,
      };
    });
  };

  const translate = (code: string) => {
    setTargetLanguage(code);
    void run(async () => {
      const response = await aiApi.translate(noteId, code);
      return {
        label: t("ai.translationTo", { language: translationLanguage(code).native }),
        text: response.translation,
      };
    });
  };

  return (
    <section className="ai-panel" aria-labelledby="ai-panel-title">
      <div className="dialog-header">
        <h2 id="ai-panel-title" className="with-icon">
          <SparkleIcon /> {t("ai.title")}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label={t("ai.tools")}>
        {TOOLS.map(({ tool: target, label, icon: ToolIcon }) => (
          <button
            key={target}
            type="button"
            role="tab"
            aria-selected={tool === target}
            onClick={() => setTool(target)}
            disabled={loading}
          >
            <ToolIcon />
            {t(label)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="tab-panel">
        {tool === "summarize" && (
          <>
            <p className="muted">{t("ai.summarizeHint")}</p>
            <button
              type="button"
              className="primary block"
              onClick={() => void summarize()}
              disabled={loading}
            >
              <SparkleIcon /> {t("ai.summarize")}
            </button>
          </>
        )}

        {tool === "ask" && (
          <form className="stack" onSubmit={ask}>
            <textarea
              rows={3}
              placeholder={t("ai.askPlaceholder")}
              aria-label={t("ai.ask")}
              maxLength={2000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={loading}
            />
            <label className="switch-row">
              <input
                type="checkbox"
                checked={thorough}
                onChange={(event) => setThorough(event.target.checked)}
              />
              <BrainIcon />
              <span>{t("ai.thorough")}</span>
            </label>
            <button type="submit" className="primary block" disabled={loading || !question.trim()}>
              {t("ai.ask")}
            </button>
          </form>
        )}

        {tool === "translate" && (
          <>
            <div className="lang-grid" role="group" aria-label={t("ai.translate")}>
              {QUICK_LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="lang-button"
                  aria-pressed={targetLanguage === code}
                  onClick={() => translate(code)}
                  disabled={loading}
                >
                  {translationLanguage(code).native}
                </button>
              ))}
            </div>
            <select
              aria-label={t("ai.moreLanguages")}
              value={QUICK_LANGUAGES.includes(targetLanguage) ? "" : targetLanguage}
              onChange={(event) => event.target.value && translate(event.target.value)}
              disabled={loading}
            >
              <option value="">{t("ai.moreLanguages")}</option>
              {TRANSLATION_LANGUAGES.filter((item) => !QUICK_LANGUAGES.includes(item.code)).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.native} · {item.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {loading && <Spinner label={t("ai.working")} />}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="ai-result">
          <p className="ai-result-label" dir="auto">
            {result.label}
          </p>
          <div className="ai-result-text" dir="auto">
            {result.text}
          </div>
          {result.note && <p className="hint">{result.note}</p>}
          <div className="ai-result-actions">
            <button type="button" className="small" onClick={() => onInsert(result.text)}>
              {t("ai.insertIntoNote")}
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => void navigator.clipboard?.writeText(result.text).catch(() => undefined)}
            >
              <CopyIcon /> {t("common.copy")}
            </button>
          </div>
          <p className="hint">{t("ai.disclaimer")}</p>
        </div>
      )}
    </section>
  );
}
