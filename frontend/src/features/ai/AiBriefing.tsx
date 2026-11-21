/** Home: "AI daily briefing" from today's tasks, due cards and active projects. */
import { useState } from "react";

import { aiToolsApi } from "../../api/v4";
import { RefreshIcon, SparkleIcon } from "../../components/Icons";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { markdownToContent } from "../../lib/markdown";
import { useWorkspace } from "../workspace/WorkspaceContext";

/** Very small Markdown renderer for the briefing (paragraphs, bullets, bold). */
function Briefing({ text }: { text: string }) {
  const blocks = markdownToContent(text);
  return (
    <div className="briefing-text" dir="auto">
      {blocks.map((block, index) => {
        const inline = (nodes: typeof block.content) =>
          (nodes ?? []).map((node, i) =>
            node.marks?.some((m) => m.type === "bold") ? (
              <strong key={i}>{node.text}</strong>
            ) : (
              <span key={i}>{node.text}</span>
            ),
          );
        if (block.type === "bulletList" || block.type === "orderedList") {
          return (
            <ul key={index}>
              {(block.content ?? []).map((item, i) => (
                <li key={i}>{inline(item.content?.[0]?.content)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{inline(block.content)}</p>;
      })}
    </div>
  );
}

export function AiBriefing() {
  const i18n = useI18n();
  const { t } = i18n;
  const { aiEnabled } = useWorkspace();
  const [text, setText] = useState<string | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("notes.briefing") ?? "null") as {
        day: string;
        text: string;
      } | null;
      return saved && saved.day === new Date().toDateString() ? saved.text : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!aiEnabled) return null;

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const result = await aiToolsApi.briefing();
      setText(result.text);
      try {
        sessionStorage.setItem(
          "notes.briefing",
          JSON.stringify({ day: new Date().toDateString(), text: result.text }),
        );
      } catch {
        // not important
      }
    } catch (err) {
      setError(errorMessage(err, i18n));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card briefing-card" aria-live="polite">
      <div className="row-between">
        <h2 className="section-title">
          <SparkleIcon /> {t("home.briefing")}
        </h2>
        {text && (
          <button
            type="button"
            className="icon-button small"
            onClick={() => void load()}
            disabled={busy}
            title={t("ai.again")}
            aria-label={t("ai.again")}
          >
            <RefreshIcon />
          </button>
        )}
      </div>
      {busy ? (
        <div className="ai-thinking">
          <span className="spinner" />
          <span>{t("ai.thinking")}</span>
        </div>
      ) : text ? (
        <Briefing text={text} />
      ) : (
        <div className="briefing-empty">
          <p className="muted small">{t("home.briefingHint")}</p>
          <button type="button" className="button" onClick={() => void load()}>
            <SparkleIcon /> {t("home.briefingButton")}
          </button>
        </div>
      )}
      {error && <p className="error-text small">{error}</p>}
    </section>
  );
}
