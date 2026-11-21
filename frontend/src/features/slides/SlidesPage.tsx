/**
 * Presentations: a gallery of decks (first slide as the thumbnail) and four ways to start:
 * a blank deck, a ready-made template, a photo slideshow from images, or an AI draft.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { filesApi } from "../../api/endpoints";
import { slidesApi } from "../../api/v5";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  CopyIcon,
  ImageIcon,
  LayersIcon,
  MoreIcon,
  MusicIcon,
  PlusIcon,
  SlidesIcon,
  SparkleIcon,
  StarIcon,
  TrashIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { EmptyState, PageHeader, Popover, Skeleton } from "../../components/ui";
import { matchesQuery, usePageQuery } from "../../hooks/usePageQuery";
import { useI18n, type TranslationKey } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { Slide, SlideTheme } from "../../types5";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { SlideView } from "./SlideView";
import { blankSlide, THEME_IDS, THEMES } from "./themes";

export const decksKey = ["slides"] as const;

function templateSlides(kind: "pitch" | "lesson" | "report", t: (key: TranslationKey) => string): Slide[] {
  const tr = (key: string) => t(key as TranslationKey);
  if (kind === "pitch") {
    return [
      blankSlide("title", { title: tr("slides.tpl.pitch.title"), subtitle: tr("slides.tpl.pitch.subtitle") }),
      blankSlide("content", {
        title: tr("slides.tpl.pitch.problem"),
        body: tr("slides.tpl.pitch.problemBody"),
      }),
      blankSlide("content", {
        title: tr("slides.tpl.pitch.solution"),
        body: tr("slides.tpl.pitch.solutionBody"),
      }),
      blankSlide("two", {
        title: tr("slides.tpl.pitch.market"),
        body: tr("slides.tpl.pitch.marketA"),
        body2: tr("slides.tpl.pitch.marketB"),
      }),
      blankSlide("quote", { title: tr("slides.tpl.pitch.quote"), subtitle: tr("slides.tpl.pitch.quoteBy") }),
      blankSlide("section", {
        title: tr("slides.tpl.pitch.thanks"),
        subtitle: tr("slides.tpl.pitch.contact"),
      }),
    ];
  }
  if (kind === "lesson") {
    return [
      blankSlide("title", {
        title: tr("slides.tpl.lesson.title"),
        subtitle: tr("slides.tpl.lesson.subtitle"),
      }),
      blankSlide("content", {
        title: tr("slides.tpl.lesson.goals"),
        body: tr("slides.tpl.lesson.goalsBody"),
      }),
      blankSlide("section", { title: tr("slides.tpl.lesson.part1") }),
      blankSlide("image-text", {
        title: tr("slides.tpl.lesson.example"),
        body: tr("slides.tpl.lesson.exampleBody"),
      }),
      blankSlide("content", {
        title: tr("slides.tpl.lesson.summary"),
        body: tr("slides.tpl.lesson.summaryBody"),
      }),
    ];
  }
  return [
    blankSlide("title", { title: tr("slides.tpl.report.title"), subtitle: tr("slides.tpl.report.subtitle") }),
    blankSlide("two", {
      title: tr("slides.tpl.report.highlights"),
      body: tr("slides.tpl.report.wins"),
      body2: tr("slides.tpl.report.challenges"),
    }),
    blankSlide("content", {
      title: tr("slides.tpl.report.numbers"),
      body: tr("slides.tpl.report.numbersBody"),
    }),
    blankSlide("content", { title: tr("slides.tpl.report.next"), body: tr("slides.tpl.report.nextBody") }),
  ];
}

export function SlidesPage() {
  const i18n = useI18n();
  const { t, calendar, plural } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { canEdit, aiEnabled } = useWorkspace();
  const query = usePageQuery();
  const { data: decks = [], isLoading } = useQuery({ queryKey: decksKey, queryFn: slidesApi.list });
  const [dialog, setDialog] = useState<"template" | "ai" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const photos = useRef<HTMLInputElement>(null);
  const shown = decks.filter((deck) =>
    matchesQuery(query, deck.title, deck.description, deck.first_slide?.title, deck.first_slide?.subtitle),
  );

  async function create(
    slides: Slide[] = [],
    title = "",
    theme: SlideTheme = "aurora",
    extra: Record<string, unknown> = {},
  ) {
    try {
      const deck = await slidesApi.create({ title, theme, slides });
      if (Object.keys(extra).length) await slidesApi.update(deck.id, extra);
      await client.invalidateQueries({ queryKey: decksKey });
      navigate(`/slides/${deck.id}`, { state: { isNew: true } });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  async function fromPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const audio = files.find((f) => f.type.startsWith("audio/"));
    if (!images.length) return;
    setBusy(t("slides.uploadingPhotos", { done: 0, total: images.length }));
    try {
      const slides: Slide[] = [];
      for (const [index, file] of images.entries()) {
        const stored = await filesApi.upload(file);
        slides.push(blankSlide("image", { image: stored.url, duration: 5 }));
        setBusy(t("slides.uploadingPhotos", { done: index + 1, total: images.length }));
      }
      let extra = {};
      if (audio) {
        const stored = await filesApi.upload(audio);
        extra = { music_url: stored.url, music_name: audio.name };
      }
      await create(slides, t("slides.photoTitle"), "midnight", {
        ...extra,
        transition: "fade",
        auto_seconds: 5,
        loop: true,
      });
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setBusy(null);
    }
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      await client.invalidateQueries({ queryKey: decksKey });
    }
  }

  return (
    <div className="page slides-page">
      <PageHeader title={t("nav.slides")} subtitle={t("slides.subtitle")} />

      {canEdit && (
        <div className="slides-start">
          <button type="button" className="slides-start-card" onClick={() => void create()}>
            <span className="slides-start-art" data-kind="blank">
              <PlusIcon />
            </span>
            <strong>{t("slides.blank")}</strong>
            <span className="muted small">{t("slides.blankHint")}</span>
          </button>
          <button type="button" className="slides-start-card" onClick={() => setDialog("template")}>
            <span className="slides-start-art" data-kind="template">
              <LayersIcon />
            </span>
            <strong>{t("slides.fromTemplate")}</strong>
            <span className="muted small">{t("slides.fromTemplateHint")}</span>
          </button>
          <button
            type="button"
            className="slides-start-card"
            onClick={() => photos.current?.click()}
            disabled={!!busy}
          >
            <span className="slides-start-art" data-kind="photos">
              <ImageIcon />
            </span>
            <strong>{busy ?? t("slides.fromPhotos")}</strong>
            <span className="muted small">{t("slides.fromPhotosHint")}</span>
          </button>
          {aiEnabled && (
            <button type="button" className="slides-start-card" onClick={() => setDialog("ai")}>
              <span className="slides-start-art" data-kind="ai">
                <SparkleIcon />
              </span>
              <strong>{t("slides.withAi")}</strong>
              <span className="muted small">{t("slides.withAiHint")}</span>
            </button>
          )}
          <input
            ref={photos}
            type="file"
            accept="image/*,audio/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void fromPhotos(files);
            }}
          />
        </div>
      )}

      <h2 className="section-title">{t("slides.yours")}</h2>
      {isLoading ? (
        <Skeleton rows={2} height={160} />
      ) : !decks.length ? (
        <EmptyState icon={SlidesIcon} title={t("slides.empty")} hint={t("slides.emptyHint")} />
      ) : !shown.length ? (
        <EmptyState icon={SlidesIcon} title={t("search.nothing")} />
      ) : (
        <div className="deck-grid">
          {shown.map((deck) => (
            <div key={deck.id} className="deck-card">
              <Link
                to={`/slides/${deck.id}`}
                className="deck-thumb"
                aria-label={deck.title || t("slides.untitled")}
              >
                {deck.first_slide ? (
                  <SlideView slide={deck.first_slide} theme={deck.theme} />
                ) : (
                  <span className="deck-thumb-empty" style={{ background: THEMES[deck.theme]?.background }} />
                )}
                <span className="deck-badges">
                  <span>
                    <LayersIcon /> {calendar.formatNumber(deck.slide_count)}
                  </span>
                  {deck.has_music && (
                    <span>
                      <MusicIcon />
                    </span>
                  )}
                </span>
              </Link>
              <div className="deck-meta">
                <span className="deck-text">
                  <strong dir="auto">{deck.title || t("slides.untitled")}</strong>
                  <span className="muted small">
                    {plural("slides.count", deck.slide_count)} · {calendar.shortDate(deck.updated_at)}
                  </span>
                </span>
                {deck.starred && (
                  <span className="deck-star">
                    <StarIcon filled />
                  </span>
                )}
                {canEdit && (
                  <Popover
                    label={t("common.actions")}
                    align="end"
                    trigger={({ open, toggle }) => (
                      <button
                        type="button"
                        className="icon-button small"
                        aria-expanded={open}
                        onClick={toggle}
                        aria-label={t("common.actions")}
                      >
                        <MoreIcon />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="menu-list">
                        <button
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            close();
                            void run(() => slidesApi.update(deck.id, { starred: !deck.starred }));
                          }}
                        >
                          <StarIcon filled={!deck.starred} />{" "}
                          {deck.starred ? t("drive.unstar") : t("drive.star")}
                        </button>
                        <button
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            close();
                            void run(() => slidesApi.duplicate(deck.id));
                          }}
                        >
                          <CopyIcon /> {t("slides.duplicate")}
                        </button>
                        <button
                          type="button"
                          className="menu-item danger"
                          onClick={async () => {
                            close();
                            const ok = await confirm({
                              title: t("slides.deleteTitle", { title: deck.title || t("slides.untitled") }),
                              confirmLabel: t("common.delete"),
                              danger: true,
                            });
                            if (ok) void run(() => slidesApi.remove(deck.id));
                          }}
                        >
                          <TrashIcon /> {t("common.delete")}
                        </button>
                      </div>
                    )}
                  </Popover>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog === "template" && (
        <TemplateDialog
          onPick={(kind, theme) => {
            setDialog(null);
            void create(templateSlides(kind, t), "", theme);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "ai" && (
        <AiDeckDialog
          onDone={(title, slides, theme) => {
            setDialog(null);
            void create(slides, title, theme);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function TemplateDialog({
  onPick,
  onClose,
}: {
  onPick: (kind: "pitch" | "lesson" | "report", theme: SlideTheme) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<SlideTheme>("aurora");
  const kinds = [
    { id: "pitch" as const, label: t("slides.tpl.pitch.name"), hint: t("slides.tpl.pitch.hint") },
    { id: "lesson" as const, label: t("slides.tpl.lesson.name"), hint: t("slides.tpl.lesson.hint") },
    { id: "report" as const, label: t("slides.tpl.report.name"), hint: t("slides.tpl.report.hint") },
  ];
  return (
    <Modal title={t("slides.fromTemplate")} icon={LayersIcon} onClose={onClose} size="xl">
      <p className="field-label">{t("slides.chooseTheme")}</p>
      <div className="theme-picker">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="theme-chip"
            aria-pressed={theme === id}
            onClick={() => setTheme(id)}
          >
            <span style={{ background: THEMES[id].background, color: THEMES[id].text }}>Aa</span>
            {t(THEMES[id].label)}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {kinds.map((kind) => {
          const first = templateSlides(kind.id, t)[0];
          return (
            <button
              key={kind.id}
              type="button"
              className="template-card"
              onClick={() => onPick(kind.id, theme)}
            >
              <SlideView slide={first} theme={theme} />
              <strong>{kind.label}</strong>
              <span className="muted small">{kind.hint}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function AiDeckDialog({
  onDone,
  onClose,
}: {
  onDone: (title: string, slides: Slide[], theme: SlideTheme) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [count, setCount] = useState(7);
  const [theme, setTheme] = useState<SlideTheme>("aurora");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const draft = await slidesApi.ai({ topic: topic.trim(), text: text.trim(), count });
      onDone(draft.title, draft.slides, theme);
    } catch (err) {
      setError(errorMessage(err, i18n));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("slides.withAi")}
      icon={SparkleIcon}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="ai-deck-form"
            className="primary"
            disabled={busy || topic.trim().length < 2}
          >
            <SparkleIcon /> {busy ? t("slides.aiWorking") : t("slides.aiCreate")}
          </button>
        </>
      }
    >
      <form id="ai-deck-form" className="stack" onSubmit={submit}>
        <label className="field">
          <span className="field-label">{t("slides.aiTopic")}</span>
          <input
            type="text"
            dir="auto"
            data-autofocus
            maxLength={500}
            placeholder={t("slides.aiTopicPlaceholder")}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{t("slides.aiSource")}</span>
          <textarea
            rows={5}
            dir="auto"
            maxLength={12000}
            placeholder={t("slides.aiSourcePlaceholder")}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t("slides.aiCount", { count })}</span>
            <input
              type="range"
              min={3}
              max={15}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">{t("slides.theme")}</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value as SlideTheme)}>
              {THEME_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(THEMES[id].label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {busy && <p className="muted small">{t("slides.aiWait")}</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
