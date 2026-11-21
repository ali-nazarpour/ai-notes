/**
 * Editing a presentation: slide strip (drag to reorder), the slide edited in place, speaker
 * notes, and a side panel with the slide's layout, background, image and timing, plus the
 * deck's theme, transition, auto-play and music. Saved automatically. Play opens the
 * full-screen presenter; Export gives PDF, PowerPoint or a standalone HTML player.
 */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { filesApi } from "../../api/endpoints";
import { slidesApi } from "../../api/v5";
import { BackgroundGrid } from "../../components/BackgroundGrid";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  BackIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  ImageIcon,
  MoreIcon,
  MusicIcon,
  PaletteIcon,
  PlayFilledIcon,
  PlusIcon,
  ShareIcon,
  SlidesIcon,
  SparkleIcon,
  TimerIcon,
  TrashIcon,
  UploadIcon,
} from "../../components/Icons";
import { EmptyState, Popover, Skeleton } from "../../components/ui";
import { useAutosave } from "../../hooks/useAutosave";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { Deck, DeckChanges, Slide, SlideLayout, SlideTransition } from "../../types5";
import { ShareDialog } from "../sharing/ShareDialog";
import { decksKey } from "./SlidesPage";
import { exportHtml, exportPdf, exportPptx } from "./exportDeck";
import { SlidePlayer } from "./SlidePlayer";
import { SlideView } from "./SlideView";
import {
  backgroundCss,
  blankSlide,
  LAYOUTS,
  newSlideId,
  SLIDE_COLORS,
  SLIDE_GRADIENTS,
  THEME_IDS,
  THEMES,
} from "./themes";

const TRANSITIONS: SlideTransition[] = ["fade", "slide", "zoom", "flip", "none"];

export function DeckEditorPage() {
  const { id } = useParams();
  const deckId = Number(id);
  const i18n = useI18n();
  const { t } = i18n;
  const { data, isLoading, error } = useQuery({
    queryKey: ["slide-deck", deckId],
    queryFn: () => slidesApi.get(deckId),
    staleTime: Infinity,
  });
  if (isLoading) return <Skeleton rows={4} height={120} />;
  if (error || !data) {
    return (
      <EmptyState
        icon={SlidesIcon}
        title={error ? errorMessage(error, i18n) : t("slides.notFound")}
        action={
          <Link to="/slides" className="button">
            {t("common.back")}
          </Link>
        }
      />
    );
  }
  return <Editor key={data.id} initial={data} />;
}

function Editor({ initial }: { initial: Deck }) {
  const i18n = useI18n();
  const { t, calendar, language } = i18n;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [deck, setDeck] = useState<Deck>(initial);
  const [current, setCurrent] = useState<string | null>(initial.slides[0]?.id ?? null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [panel, setPanel] = useState<"slide" | "deck">("slide");
  const [exporting, setExporting] = useState(false);
  const readOnly = deck.role === "viewer";
  const imageInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const { state: saveState, schedule } = useAutosave<DeckChanges>(async (changes) => {
    const saved = await slidesApi.update(deck.id, changes);
    client.setQueryData(["slide-deck", deck.id], saved);
    void client.invalidateQueries({ queryKey: decksKey });
  });

  const change = useCallback(
    (changes: DeckChanges) => {
      setDeck((d) => ({ ...d, ...changes }));
      schedule(changes);
    },
    [schedule],
  );

  const setSlides = useCallback(
    (update: (slides: Slide[]) => Slide[]) => {
      setDeck((d) => {
        const slides = update(d.slides);
        schedule({ slides });
        return { ...d, slides };
      });
    },
    [schedule],
  );

  const slideIndex = Math.max(
    0,
    deck.slides.findIndex((s) => s.id === current),
  );
  const slide = deck.slides[slideIndex] ?? null;
  /** Index of the current slide among the slides shown when playing. */
  const visibleIndex = Math.max(
    0,
    deck.slides.filter((s) => !s.hidden).findIndex((s) => s.id === slide?.id),
  );
  const patchSlide = (changes: Partial<Slide>) =>
    slide && setSlides((slides) => slides.map((s) => (s.id === slide.id ? { ...s, ...changes } : s)));

  function addSlide(layout: SlideLayout) {
    const created = blankSlide(layout);
    setSlides((slides) => {
      const index = slides.findIndex((s) => s.id === current);
      const next = [...slides];
      next.splice(index + 1, 0, created);
      return next;
    });
    setCurrent(created.id);
  }

  function duplicateSlide(target: Slide) {
    const copy = { ...target, id: newSlideId() };
    setSlides((slides) => {
      const index = slides.findIndex((s) => s.id === target.id);
      const next = [...slides];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setCurrent(copy.id);
  }

  function removeSlide(target: Slide) {
    const index = deck.slides.findIndex((s) => s.id === target.id);
    setSlides((slides) => slides.filter((s) => s.id !== target.id));
    const neighbour = deck.slides[index + 1] ?? deck.slides[index - 1];
    setCurrent(neighbour && neighbour.id !== target.id ? neighbour.id : null);
    toast(t("slides.slideDeleted"), "success", {
      label: t("common.undo"),
      run: () => {
        setSlides((slides) => {
          const next = [...slides];
          next.splice(index, 0, target);
          return next;
        });
        setCurrent(target.id);
      },
    });
  }

  async function upload(file: File, kind: "image" | "audio"): Promise<string | null> {
    setUploading(kind);
    try {
      const stored = await filesApi.upload(file);
      if (stored.kind !== kind) {
        toast(t(kind === "image" ? "notes.coverImageOnly" : "slides.audioOnly"), "error");
        return null;
      }
      return stored.url;
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
      return null;
    } finally {
      setUploading(null);
    }
  }

  async function addImages(files: File[]) {
    const created: Slide[] = [];
    for (const file of files) {
      const url = await upload(file, "image");
      if (url) created.push(blankSlide("image", { image: url }));
    }
    if (!created.length) return;
    setSlides((slides) => {
      const index = slides.findIndex((s) => s.id === current);
      const next = [...slides];
      next.splice(index + 1, 0, ...created);
      return next;
    });
    setCurrent(created[created.length - 1].id);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSlides((slides) => {
      const from = slides.findIndex((s) => s.id === active.id);
      const to = slides.findIndex((s) => s.id === over.id);
      return arrayMove(slides, from, to);
    });
  }

  // Keyboard: up/down move between slides when not typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]") ||
        playing !== null
      )
        return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const next = deck.slides[slideIndex + (event.key === "ArrowDown" ? 1 : -1)];
        if (next) {
          event.preventDefault();
          setCurrent(next.id);
        }
      }
      if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
        event.preventDefault();
        setPlaying(visibleIndex);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deck.slides, slideIndex, visibleIndex, playing]);

  async function runExport(kind: "pdf" | "pptx" | "html") {
    setExporting(true);
    try {
      const dir = language === "fa" ? "rtl" : "ltr";
      if (kind === "pdf") exportPdf(deck, dir);
      else if (kind === "pptx") await exportPptx(deck);
      else await exportHtml(deck, dir, t("slides.start"));
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    } finally {
      setExporting(false);
    }
  }

  const status: Record<string, string> = {
    saved: t("notes.saved"),
    pending: t("notes.unsaved"),
    saving: t("notes.saving"),
    error: t("notes.saveFailed"),
  };

  return (
    <div className="deck-editor">
      <header className="deck-bar">
        <button
          type="button"
          className="icon-button"
          onClick={() => navigate("/slides")}
          aria-label={t("common.back")}
        >
          <BackIcon />
        </button>
        <input
          className="deck-title"
          dir="auto"
          maxLength={200}
          value={deck.title}
          placeholder={t("slides.untitled")}
          readOnly={readOnly}
          onChange={(event) => change({ title: event.target.value })}
          aria-label={t("slides.deckTitle")}
        />
        <span className="save-state" data-state={saveState} role="status">
          <span className="save-dot" aria-hidden="true" />
          <span className="hide-on-phone">{status[saveState]}</span>
        </span>
        <span className="deck-bar-actions">
          {!readOnly && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setSharing(true)}
              title={t("page.share")}
              aria-label={t("page.share")}
            >
              <ShareIcon />
            </button>
          )}
          <Popover
            label={t("slides.export")}
            align="end"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="ghost"
                aria-expanded={open}
                onClick={toggle}
                disabled={exporting}
              >
                <DownloadIcon />{" "}
                <span className="hide-on-phone">
                  {exporting ? t("slides.exporting") : t("slides.export")}
                </span>
              </button>
            )}
          >
            {(close) => (
              <div className="menu-list export-menu">
                {(
                  [
                    ["pdf", t("slides.exportPdf"), t("slides.exportPdfHint")],
                    ["pptx", t("slides.exportPptx"), t("slides.exportPptxHint")],
                    ["html", t("slides.exportHtml"), t("slides.exportHtmlHint")],
                  ] as const
                ).map(([kind, label, hint]) => (
                  <button
                    key={kind}
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      close();
                      void runExport(kind);
                    }}
                  >
                    <span className={`export-badge export-${kind}`}>{kind.toUpperCase()}</span>
                    <span className="menu-item-text">
                      <span>{label}</span>
                      <span className="muted small">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Popover>
          <button
            type="button"
            className="primary"
            onClick={() => setPlaying(0)}
            disabled={!deck.slides.some((s) => !s.hidden)}
          >
            <PlayFilledIcon /> <span>{t("slides.play")}</span>
          </button>
          {!readOnly && (
            <Popover
              label={t("common.actions")}
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className="icon-button"
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
                      setPlaying(visibleIndex);
                    }}
                  >
                    <PlayFilledIcon /> {t("slides.playFromHere")}
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={async () => {
                      close();
                      try {
                        const copy = await slidesApi.duplicate(deck.id);
                        await client.invalidateQueries({ queryKey: decksKey });
                        navigate(`/slides/${copy.id}`);
                      } catch (err) {
                        toast(errorMessage(err, i18n), "error");
                      }
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
                      if (!ok) return;
                      await slidesApi.remove(deck.id).catch((err) => toast(errorMessage(err, i18n), "error"));
                      await client.invalidateQueries({ queryKey: decksKey });
                      navigate("/slides");
                    }}
                  >
                    <TrashIcon /> {t("common.delete")}
                  </button>
                </div>
              )}
            </Popover>
          )}
        </span>
      </header>

      <div className="deck-body" data-readonly={readOnly}>
        <aside className="deck-strip" aria-label={t("slides.slides")}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={deck.slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ol>
                {deck.slides.map((s, index) => (
                  <StripItem
                    key={s.id}
                    slide={s}
                    index={index}
                    active={s.id === slide?.id}
                    deck={deck}
                    readOnly={readOnly}
                    onSelect={() => setCurrent(s.id)}
                    onDuplicate={() => duplicateSlide(s)}
                    onDelete={() => removeSlide(s)}
                    onToggleHidden={() =>
                      setSlides((slides) =>
                        slides.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x)),
                      )
                    }
                    label={calendar.formatNumber(index + 1)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {!readOnly && (
            <div className="deck-strip-add">
              <Popover
                label={t("slides.addSlide")}
                trigger={({ open, toggle }) => (
                  <button type="button" className="deck-add" aria-expanded={open} onClick={toggle}>
                    <PlusIcon /> {t("slides.addSlide")}
                  </button>
                )}
              >
                {(close) => (
                  <div className="layout-picker">
                    {LAYOUTS.map((layout) => (
                      <button
                        key={layout.id}
                        type="button"
                        onClick={() => {
                          close();
                          addSlide(layout.id);
                        }}
                      >
                        <span className={`layout-thumb layout-thumb-${layout.id}`} aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        {t(layout.label)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="layout-picker-images"
                      onClick={() => {
                        close();
                        imageInput.current?.setAttribute("data-mode", "slides");
                        imageInput.current?.click();
                      }}
                    >
                      <ImageIcon /> {t("slides.addImages")}
                    </button>
                  </div>
                )}
              </Popover>
            </div>
          )}
        </aside>

        <main className="deck-stage">
          {slide ? (
            <>
              <div className="deck-canvas" data-hidden={slide.hidden}>
                <SlideView
                  slide={slide}
                  theme={deck.theme}
                  editable={!readOnly}
                  onChange={patchSlide}
                  onPickImage={
                    readOnly
                      ? undefined
                      : () => {
                          imageInput.current?.setAttribute("data-mode", "slide");
                          imageInput.current?.click();
                        }
                  }
                  placeholders={{
                    title: t("slides.ph.title"),
                    subtitle: t("slides.ph.subtitle"),
                    body: t("slides.ph.body"),
                    body2: t("slides.ph.body2"),
                  }}
                />
                {slide.hidden && (
                  <span className="deck-hidden-badge">
                    <EyeIcon off /> {t("slides.hiddenSlide")}
                  </span>
                )}
                {uploading && <span className="deck-uploading">{t("editor.uploading")}</span>}
              </div>
              <label className="deck-notes">
                <span className="field-label">{t("slides.speakerNotes")}</span>
                <textarea
                  dir="auto"
                  rows={3}
                  readOnly={readOnly}
                  placeholder={t("slides.notesPlaceholder")}
                  value={slide.notes}
                  onChange={(event) => patchSlide({ notes: event.target.value })}
                />
              </label>
            </>
          ) : (
            <EmptyState
              icon={SlidesIcon}
              title={t("slides.noSlides")}
              action={
                !readOnly && (
                  <button type="button" className="primary" onClick={() => addSlide("title")}>
                    <PlusIcon /> {t("slides.addSlide")}
                  </button>
                )
              }
            />
          )}
        </main>

        {!readOnly && (
          <aside className="deck-panel">
            <div className="segmented" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={panel === "slide"}
                onClick={() => setPanel("slide")}
              >
                <SlidesIcon /> {t("slides.thisSlide")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panel === "deck"}
                onClick={() => setPanel("deck")}
              >
                <PaletteIcon /> {t("slides.design")}
              </button>
            </div>

            {panel === "slide" && slide && (
              <div className="deck-panel-body">
                <p className="field-label">{t("slides.layoutLabel")}</p>
                <div className="layout-grid">
                  {LAYOUTS.map((layout) => (
                    <button
                      key={layout.id}
                      type="button"
                      aria-pressed={slide.layout === layout.id}
                      title={t(layout.label)}
                      onClick={() =>
                        patchSlide({
                          layout: layout.id,
                          align: ["title", "section", "quote"].includes(layout.id)
                            ? "center"
                            : slide.align === "center" &&
                                !["title", "section", "quote"].includes(slide.layout)
                              ? "center"
                              : "start",
                        })
                      }
                    >
                      <span className={`layout-thumb layout-thumb-${layout.id}`} aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="small">{t(layout.label)}</span>
                    </button>
                  ))}
                </div>

                <p className="field-label">{t("slides.background")}</p>
                <BackgroundGrid
                  size="sm"
                  label={t("slides.background")}
                  value={slide.background}
                  onChange={(background) => patchSlide({ background })}
                  groups={[
                    {
                      id: "gradients",
                      label: t("bg.gradients"),
                      options: SLIDE_GRADIENTS.map((bg) => ({
                        value: bg,
                        style: { background: backgroundCss(bg) ?? undefined },
                        label: bg.slice(9),
                      })),
                    },
                    {
                      id: "colors",
                      label: t("bg.colors"),
                      options: SLIDE_COLORS.map((bg) => ({
                        value: bg,
                        style: { background: bg },
                        label: bg,
                      })),
                    },
                  ]}
                  extra={
                    <>
                      <button
                        type="button"
                        className="bg-extra"
                        aria-pressed={!slide.background}
                        onClick={() => patchSlide({ background: null })}
                        title={t("slides.themeBackground")}
                        aria-label={t("slides.themeBackground")}
                      >
                        <span style={{ background: THEMES[deck.theme].background }} />
                      </button>
                      <button
                        type="button"
                        className="bg-extra"
                        aria-pressed={!!slide.background?.startsWith("/api/files/")}
                        onClick={() => bgInput.current?.click()}
                        title={t("slides.backgroundImage")}
                        aria-label={t("slides.backgroundImage")}
                      >
                        {slide.background?.startsWith("/api/files/") ? (
                          <span style={{ background: backgroundCss(slide.background) ?? undefined }} />
                        ) : (
                          <UploadIcon />
                        )}
                      </button>
                    </>
                  }
                />

                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">{t("slides.textColor")}</span>
                    <span className="color-field">
                      <input
                        type="color"
                        value={slide.text_color ?? "#ffffff"}
                        onChange={(event) => patchSlide({ text_color: event.target.value })}
                      />
                      {slide.text_color && (
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => patchSlide({ text_color: null })}
                        >
                          {t("slides.auto")}
                        </button>
                      )}
                    </span>
                  </label>
                  <div className="field">
                    <span className="field-label">{t("slides.align")}</span>
                    <div className="segmented compact">
                      <button
                        type="button"
                        aria-pressed={slide.align === "start"}
                        onClick={() => patchSlide({ align: "start" })}
                      >
                        {t("slides.alignStart")}
                      </button>
                      <button
                        type="button"
                        aria-pressed={slide.align === "center"}
                        onClick={() => patchSlide({ align: "center" })}
                      >
                        {t("slides.alignCenter")}
                      </button>
                    </div>
                  </div>
                </div>

                {["image", "image-text", "blank"].includes(slide.layout) && (
                  <div className="field">
                    <span className="field-label">{t("slides.image")}</span>
                    <div className="row wrap">
                      <button
                        type="button"
                        className="small"
                        onClick={() => {
                          imageInput.current?.setAttribute("data-mode", "slide");
                          imageInput.current?.click();
                        }}
                      >
                        <ImageIcon /> {slide.image ? t("slides.changeImage") : t("slides.addImage")}
                      </button>
                      {slide.image && (
                        <>
                          <div className="segmented compact">
                            <button
                              type="button"
                              aria-pressed={slide.image_fit === "cover"}
                              onClick={() => patchSlide({ image_fit: "cover" })}
                            >
                              {t("slides.fitCover")}
                            </button>
                            <button
                              type="button"
                              aria-pressed={slide.image_fit === "contain"}
                              onClick={() => patchSlide({ image_fit: "contain" })}
                            >
                              {t("slides.fitContain")}
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ghost small danger"
                            onClick={() => patchSlide({ image: null })}
                          >
                            <TrashIcon />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <label className="field">
                  <span className="field-label">
                    <TimerIcon /> {t("slides.duration")}
                  </span>
                  <span className="row">
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={slide.duration || ""}
                      placeholder={deck.auto_seconds ? String(deck.auto_seconds) : t("slides.manual")}
                      onChange={(event) =>
                        patchSlide({ duration: Math.max(0, Math.min(600, Number(event.target.value) || 0)) })
                      }
                    />
                    <span className="muted small">{t("slides.seconds")}</span>
                  </span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={slide.hidden}
                    onChange={(event) => patchSlide({ hidden: event.target.checked })}
                  />
                  {t("slides.hideSlide")}
                </label>
              </div>
            )}

            {panel === "deck" && (
              <div className="deck-panel-body">
                <p className="field-label">{t("slides.theme")}</p>
                <div className="theme-grid">
                  {THEME_IDS.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      aria-pressed={deck.theme === theme}
                      onClick={() => change({ theme })}
                      title={t(THEMES[theme].label)}
                    >
                      <span
                        className="theme-swatch"
                        style={{
                          background: THEMES[theme].background,
                          color: THEMES[theme].text,
                          fontFamily: THEMES[theme].font,
                        }}
                      >
                        <b>Aa</b>
                        <i style={{ background: THEMES[theme].accent }} />
                      </span>
                      <span className="small">{t(THEMES[theme].label)}</span>
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span className="field-label">{t("slides.transition")}</span>
                  <select
                    value={deck.transition}
                    onChange={(event) => change({ transition: event.target.value as SlideTransition })}
                  >
                    {TRANSITIONS.map((tr) => (
                      <option key={tr} value={tr}>
                        {t(`slides.transition.${tr}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="deck-advance">
                  <label className="field">
                    <span className="field-label">{t("slides.autoAdvance")}</span>
                    <span className="row">
                      <input
                        type="number"
                        min={0}
                        max={600}
                        value={deck.auto_seconds || ""}
                        placeholder={t("slides.manual")}
                        onChange={(event) =>
                          change({
                            auto_seconds: Math.max(0, Math.min(600, Number(event.target.value) || 0)),
                          })
                        }
                      />
                      <span className="muted small">{t("slides.seconds")}</span>
                    </span>
                  </label>
                  <label className="check-row deck-loop">
                    <input
                      type="checkbox"
                      checked={deck.loop}
                      onChange={(event) => change({ loop: event.target.checked })}
                    />
                    {t("slides.loop")}
                  </label>
                </div>

                <div className="field">
                  <span className="field-label">
                    <MusicIcon /> {t("slides.music")}
                  </span>
                  {deck.music_url ? (
                    <div className="music-card">
                      <span className="music-icon">
                        <MusicIcon />
                      </span>
                      <span className="music-text">
                        <strong dir="auto">{deck.music_name || t("slides.music")}</strong>
                        <audio src={deck.music_url} controls preload="none" />
                      </span>
                      <button
                        type="button"
                        className="icon-button small danger"
                        onClick={() => change({ music_url: null, music_name: "" })}
                        aria-label={t("common.delete")}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="music-add"
                      onClick={() => musicInput.current?.click()}
                      disabled={uploading === "audio"}
                    >
                      <MusicIcon /> {uploading === "audio" ? t("editor.uploading") : t("slides.addMusic")}
                    </button>
                  )}
                  {deck.music_url && (
                    <label className="volume-row">
                      <span className="muted small">{t("slides.volume")}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={deck.music_volume}
                        onChange={(event) => change({ music_volume: Number(event.target.value) })}
                      />
                      <span className="muted small">{calendar.formatNumber(deck.music_volume)}٪</span>
                    </label>
                  )}
                  <p className="hint">{t("slides.musicHint")}</p>
                </div>
                <p className="hint">
                  <SparkleIcon /> {t("slides.tip")}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          const mode = event.target.getAttribute("data-mode");
          event.target.value = "";
          if (!files.length) return;
          if (mode === "slides" || files.length > 1) await addImages(files);
          else {
            const url = await upload(files[0], "image");
            if (url)
              patchSlide({
                image: url,
                layout: ["image", "image-text", "blank"].includes(slide?.layout ?? "")
                  ? slide!.layout
                  : "image",
              });
          }
        }}
      />
      <input
        ref={bgInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const url = await upload(file, "image");
          if (url) patchSlide({ background: url });
        }}
      />
      <input
        ref={musicInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const url = await upload(file, "audio");
          if (url) change({ music_url: url, music_name: file.name.replace(/\.[^.]+$/, "") });
        }}
      />

      {playing !== null && <SlidePlayer deck={deck} start={playing} onClose={() => setPlaying(null)} />}
      {sharing && (
        <ShareDialog kind="deck" itemId={deck.id} title={deck.title} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}

function StripItem({
  slide,
  index,
  active,
  deck,
  readOnly,
  label,
  onSelect,
  onDuplicate,
  onDelete,
  onToggleHidden,
}: {
  slide: Slide;
  index: number;
  active: boolean;
  deck: Deck;
  readOnly: boolean;
  label: string;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
    disabled: readOnly,
  });
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        ref.current = node;
      }}
      className="strip-item"
      data-active={active}
      data-hidden={slide.hidden}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span className="strip-number">{label}</span>
      <button
        type="button"
        className="strip-thumb"
        onClick={onSelect}
        aria-label={t("slides.slideN", { n: index + 1 })}
        aria-current={active}
        {...attributes}
        {...listeners}
      >
        <SlideView slide={slide} theme={deck.theme} />
        {slide.hidden && (
          <span className="strip-hidden">
            <EyeIcon off />
          </span>
        )}
        {(slide.duration > 0 || slide.image) && (
          <span className="strip-badges">{slide.duration > 0 && <TimerIcon />}</span>
        )}
      </button>
      {!readOnly && (
        <span className="strip-actions">
          <button
            type="button"
            className="icon-button small"
            onClick={onDuplicate}
            title={t("slides.duplicateSlide")}
            aria-label={t("slides.duplicateSlide")}
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            className="icon-button small"
            onClick={onToggleHidden}
            title={slide.hidden ? t("slides.showSlide") : t("slides.hideSlide")}
            aria-label={slide.hidden ? t("slides.showSlide") : t("slides.hideSlide")}
          >
            <EyeIcon off={!slide.hidden} />
          </button>
          <button
            type="button"
            className="icon-button small danger"
            onClick={onDelete}
            title={t("common.delete")}
            aria-label={t("common.delete")}
          >
            <TrashIcon />
          </button>
        </span>
      )}
    </li>
  );
}
