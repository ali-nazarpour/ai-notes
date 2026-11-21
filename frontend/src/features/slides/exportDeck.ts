/**
 * Exporting a presentation:
 * - PDF: every slide on its own landscape page, printed by the browser ("Save as PDF").
 * - PowerPoint (.pptx): real slides with titles, bullet points, images and speaker notes.
 * - HTML: one self-contained file that plays the deck (with its music) in any browser,
 *   images and music embedded, no internet needed.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { authHeaders } from "../../api/client";
import { safeFilename } from "../../lib/exporters";
import slidesCss from "../../styles/slides.css?raw";
import type { Deck, Slide } from "../../types5";
import { SlideView } from "./SlideView";
import { bodyBlocks, isLight, THEMES } from "./themes";

const visible = (deck: Deck) => deck.slides.filter((s) => !s.hidden);

function slideMarkup(deck: Deck, slide: Slide): string {
  return renderToStaticMarkup(createElement(SlideView, { slide, theme: deck.theme }));
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The deck with every uploaded image (and the music) replaced by data: URLs. */
async function embedMedia(deck: Deck, withMusic: boolean): Promise<Deck> {
  const cache = new Map<string, string>();
  const embed = async (url: string | null): Promise<string | null> => {
    if (!url || !url.startsWith("/api/files/")) return url;
    if (!cache.has(url)) cache.set(url, await toDataUrl(url).catch(() => url));
    return cache.get(url)!;
  };
  const slides: Slide[] = [];
  for (const slide of deck.slides) {
    slides.push({
      ...slide,
      image: await embed(slide.image),
      background: slide.background?.startsWith("/api/files/")
        ? await embed(slide.background)
        : slide.background,
    });
  }
  return { ...deck, slides, music_url: withMusic ? await embed(deck.music_url) : deck.music_url };
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

// ---------------------------------------------------------------- PDF

export function exportPdf(deck: Deck, dir: "ltr" | "rtl"): void {
  const pages = visible(deck)
    .map((slide) => `<section class="print-page">${slideMarkup(deck, slide)}</section>`)
    .join("");
  // Reuse the app's own styles (fonts included) so slides look exactly the same.
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
  const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(deck.title)}</title>${styles}
<style>
  @page { size: 297mm 167.06mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .print-page { width: 297mm; height: 167.06mm; page-break-after: always; break-after: page; overflow: hidden; }
  .print-page .slide-frame { width: 100%; height: 100%; border-radius: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${pages}</body></html>`;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;inset:auto;width:0;height:0;border:0;opacity:0";
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const print = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  // Wait for images and fonts.
  const images = Array.from(doc.images);
  Promise.all([
    ...images.map((img) =>
      img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r)),
    ),
    doc.fonts?.ready ?? Promise.resolve(),
  ]).then(() => setTimeout(print, 300));
}

// ---------------------------------------------------------------- PowerPoint

const RTL = /[\u0590-\u08ff]/;

export async function exportPptx(deck: Deck): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9"; // 10 x 5.625 inches
  pptx.title = deck.title;
  const theme = THEMES[deck.theme] ?? THEMES.aurora;
  const media = await embedMedia(deck, false);

  for (const slide of visible(media)) {
    const page = pptx.addSlide();
    const bg = slide.background;
    if (bg?.startsWith("#")) page.background = { color: bg.slice(1) };
    else if (bg?.startsWith("data:")) page.background = { data: bg };
    else page.background = { color: theme.pptx.background };
    const light = isLight(slide.background);
    const color = (slide.text_color?.replace("#", "") ||
      (light === null ? theme.pptx.text : light ? "111827" : "FFFFFF")) as string;
    const rtl = (text: string) => RTL.test(text);
    const align = slide.align === "center" ? "center" : undefined;
    const text = (value: string, options: Record<string, unknown>) =>
      value &&
      page.addText(value, {
        color,
        fontFace: "Vazirmatn",
        rtlMode: rtl(value),
        align: (options.align as "center" | undefined) ?? align ?? (rtl(value) ? "right" : "left"),
        valign: "top",
        fit: "shrink",
        ...options,
      });
    const bullets = (value: string, x: number, y: number, w: number, h: number) => {
      const runs = bodyBlocks(value).flatMap((block) =>
        block.bullets.length
          ? block.bullets.map((item) => ({
              text: item,
              options: { bullet: { indent: 18 }, rtlMode: rtl(item), breakLine: true },
            }))
          : [{ text: block.text, options: { rtlMode: rtl(block.text), breakLine: true } }],
      );
      if (runs.length)
        page.addText(runs, {
          x,
          y,
          w,
          h,
          fontSize: 18,
          color,
          fontFace: "Vazirmatn",
          valign: "top",
          paraSpaceAfter: 8,
          fit: "shrink",
          align: rtl(value) ? "right" : "left",
        });
    };
    const image = (x: number, y: number, w: number, h: number) =>
      slide.image?.startsWith("data:") &&
      page.addImage({
        data: slide.image,
        x,
        y,
        w,
        h,
        sizing: { type: slide.image_fit === "contain" ? "contain" : "cover", w, h },
      });

    switch (slide.layout) {
      case "title":
      case "section":
        text(slide.title, {
          x: 0.7,
          y: 1.6,
          w: 8.6,
          h: 1.4,
          fontSize: 40,
          bold: true,
          align: slide.layout === "title" ? "center" : align,
          valign: "middle",
        });
        page.addShape("rect", {
          x: slide.layout === "title" ? 4.45 : 0.75,
          y: 3.1,
          w: 1.1,
          h: 0.07,
          fill: { color: theme.pptx.accent },
          line: { color: theme.pptx.accent },
        });
        text(slide.subtitle, {
          x: 0.7,
          y: 3.3,
          w: 8.6,
          h: 0.9,
          fontSize: 20,
          align: slide.layout === "title" ? "center" : align,
        });
        break;
      case "quote":
        text("“", { x: 0.7, y: 0.4, w: 8.6, h: 1, fontSize: 80, color: theme.pptx.accent, align: "center" });
        text(slide.title, {
          x: 1,
          y: 1.4,
          w: 8,
          h: 2.4,
          fontSize: 28,
          italic: true,
          align: "center",
          valign: "middle",
        });
        text(slide.subtitle ? `— ${slide.subtitle}` : "", {
          x: 1,
          y: 4,
          w: 8,
          h: 0.6,
          fontSize: 16,
          align: "center",
        });
        break;
      case "two":
        text(slide.title, { x: 0.6, y: 0.4, w: 8.8, h: 0.9, fontSize: 30, bold: true });
        bullets(slide.body, 0.6, 1.5, 4.25, 3.6);
        bullets(slide.body2, 5.15, 1.5, 4.25, 3.6);
        break;
      case "image":
        image(0, 0, 10, 5.625);
        if (slide.title || slide.subtitle) {
          page.addShape("rect", {
            x: 0,
            y: 4.1,
            w: 10,
            h: 1.525,
            fill: { color: "000000", transparency: 45 },
            line: { color: "000000", transparency: 100 },
          });
          text(slide.title, { x: 0.5, y: 4.2, w: 9, h: 0.7, fontSize: 26, bold: true, color: "FFFFFF" });
          text(slide.subtitle, { x: 0.5, y: 4.85, w: 9, h: 0.5, fontSize: 14, color: "FFFFFF" });
        }
        break;
      case "image-text":
        image(0.5, 0.6, 4.4, 4.4);
        text(slide.title, { x: 5.2, y: 0.6, w: 4.3, h: 1, fontSize: 28, bold: true });
        bullets(slide.body, 5.2, 1.7, 4.3, 3.3);
        break;
      case "blank":
        image(2, 0.6, 6, 3.75);
        bullets(slide.body, 1, slide.image ? 4.5 : 1, 8, slide.image ? 0.9 : 3.6);
        break;
      default:
        text(slide.title, { x: 0.6, y: 0.4, w: 8.8, h: 0.9, fontSize: 30, bold: true });
        text(slide.subtitle, { x: 0.6, y: 1.2, w: 8.8, h: 0.5, fontSize: 16 });
        bullets(slide.body, 0.6, slide.subtitle ? 1.8 : 1.5, 8.8, 3.5);
    }
    if (slide.notes) page.addNotes(slide.notes);
  }
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  save(blob, `${safeFilename(deck.title, "presentation")}.pptx`);
}

// ---------------------------------------------------------------- standalone HTML

const PLAYER_SCRIPT = `
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.deck-slide'));
  var auto = Number(document.body.dataset.auto) || 0;
  var loop = document.body.dataset.loop === 'true';
  var music = document.getElementById('music');
  var index = 0, timer = null;
  var rtl = document.documentElement.dir === 'rtl';
  function show(i) {
    if (i >= slides.length) { if (loop) i = 0; else return; }
    if (i < 0) i = 0;
    slides[index].classList.remove('active');
    index = i;
    slides[index].classList.add('active');
    document.getElementById('count').textContent = (index + 1) + ' / ' + slides.length;
    document.getElementById('bar').style.width = ((index + 1) / slides.length * 100) + '%';
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    var seconds = Number(slides[index].dataset.duration) || auto;
    if (seconds && started) timer = setTimeout(function () { show(index + 1); }, seconds * 1000);
  }
  var started = false;
  document.getElementById('start').onclick = function () {
    started = true;
    this.parentNode.style.display = 'none';
    if (music) music.play().catch(function () {});
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    schedule();
  };
  document.addEventListener('keydown', function (e) {
    var next = rtl ? 'ArrowLeft' : 'ArrowRight', prev = rtl ? 'ArrowRight' : 'ArrowLeft';
    if ([next, 'ArrowDown', ' ', 'PageDown', 'Enter'].indexOf(e.key) >= 0) { e.preventDefault(); show(index + 1); }
    if ([prev, 'ArrowUp', 'PageUp', 'Backspace'].indexOf(e.key) >= 0) { e.preventDefault(); show(index - 1); }
    if (e.key === 'm' && music) music.muted = !music.muted;
  });
  document.getElementById('stage').addEventListener('click', function (e) {
    if (!started) return;
    var left = e.clientX < window.innerWidth * 0.3;
    show(left !== rtl ? index - 1 : index + 1);
  });
  show(0);
})();`;

export async function exportHtml(deck: Deck, dir: "ltr" | "rtl", startLabel: string): Promise<void> {
  const media = await embedMedia(deck, true);
  const slides = visible(media)
    .map(
      (slide, i) =>
        `<div class="deck-slide${i === 0 ? " active" : ""}" data-duration="${slide.duration || 0}">${slideMarkup(media, slide)}</div>`,
    )
    .join("\n");
  const music = media.music_url
    ? `<audio id="music" src="${media.music_url}" loop preload="auto"></audio><script>document.getElementById('music').volume=${Math.min(1, media.music_volume / 100)};</script>`
    : "";
  const html = `<!doctype html>
<html dir="${dir}" lang="${dir === "rtl" ? "fa" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(deck.title)}</title>
<style>
${slidesCss}
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; font-family: Vazirmatn, Tahoma, system-ui, sans-serif; }
#stage { position: fixed; inset: 0; display: grid; place-items: center; cursor: pointer; }
.deck-slide { position: absolute; width: min(100vw, 177.78vh); opacity: 0; transition: opacity .6s ease; pointer-events: none; }
.deck-slide.active { opacity: 1; }
#hud { position: fixed; bottom: 14px; inset-inline-end: 18px; color: #fff; font: 13px system-ui; opacity: .7; }
#progress { position: fixed; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(255,255,255,.15); }
#bar { height: 100%; background: #fff; transition: width .3s; }
#cover { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.55); backdrop-filter: blur(6px); z-index: 2; }
#start { font: 600 18px system-ui; padding: 16px 32px; border: 0; border-radius: 999px; background: #fff; color: #111; cursor: pointer; }
</style>
</head>
<body data-auto="${media.auto_seconds}" data-loop="${media.loop}">
<div id="stage">${slides}</div>
<div id="cover"><button id="start" type="button">▶ ${escapeHtml(startLabel)}</button></div>
<div id="hud"><span id="count"></span></div>
<div id="progress"><div id="bar"></div></div>
${music}
<script>${PLAYER_SCRIPT}</script>
</body>
</html>`;
  save(new Blob([html], { type: "text/html" }), `${safeFilename(deck.title, "presentation")}.html`);
}
