/**
 * One slide, drawn in a 16:9 frame. Sizes use container units (cqw), so the same markup
 * looks identical as a thumbnail, in the editor, full screen and in exported files.
 * In the editor, the texts are editable in place.
 */
import type { ReactNode } from "react";

import { ImageIcon } from "../../components/Icons";
import type { Slide, SlideTheme } from "../../types5";
import { bodyBlocks, slideText, themeVars } from "./themes";

const RTL_TEXT = /[\u0590-\u08ff]/;
const LTR_TEXT = /[A-Za-z\u00c0-\u024f\u0400-\u04ff]/;

/** A slide reads in the direction of its own text (an English slide in a Persian app is LTR). */
function slideDirection(slide: Slide): "rtl" | "ltr" | undefined {
  const text = slideText(slide);
  if (RTL_TEXT.test(text)) return "rtl";
  if (LTR_TEXT.test(text)) return "ltr";
  return undefined;
}

type Field = "title" | "subtitle" | "body" | "body2";

interface Props {
  slide: Slide;
  theme: SlideTheme;
  editable?: boolean;
  onChange?: (changes: Partial<Slide>) => void;
  onPickImage?: () => void;
  placeholders?: Partial<Record<Field, string>>;
  className?: string;
}

function Body({ text }: { text: string }) {
  return (
    <>
      {bodyBlocks(text).map((block, index) =>
        block.bullets.length ? (
          <ul key={index} className="slide-bullets">
            {block.bullets.map((item, i) => (
              <li key={i} dir="auto">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="slide-para" dir="auto">
            {block.text}
          </p>
        ),
      )}
    </>
  );
}

export function SlideView({
  slide,
  theme,
  editable = false,
  onChange,
  onPickImage,
  placeholders = {},
  className = "",
}: Props) {
  const text = (field: Field, cls: string, multiline = false): ReactNode => {
    const value = slide[field];
    if (editable && onChange) {
      return (
        <textarea
          className={`slide-edit ${cls}`}
          dir="auto"
          rows={multiline ? 3 : 1}
          value={value}
          placeholder={placeholders[field] ?? ""}
          onChange={(event) => onChange({ [field]: event.target.value })}
        />
      );
    }
    if (!value) return null;
    if (field === "body" || field === "body2") {
      return (
        <div className={cls}>
          <Body text={value} />
        </div>
      );
    }
    return (
      <div className={cls} dir="auto">
        {value}
      </div>
    );
  };

  const image = (cls: string) =>
    slide.image ? (
      <div className={`slide-image ${cls}`} data-fit={slide.image_fit}>
        <img src={slide.image} alt="" draggable={false} />
        {editable && onPickImage && (
          <button type="button" className="slide-image-change" onClick={onPickImage}>
            <ImageIcon />
          </button>
        )}
      </div>
    ) : editable && onPickImage ? (
      <button type="button" className={`slide-image slide-image-empty ${cls}`} onClick={onPickImage}>
        <ImageIcon />
      </button>
    ) : null;

  let content: ReactNode;
  switch (slide.layout) {
    case "title":
      content = (
        <div className="slide-stack slide-centered">
          {text("title", "slide-title slide-title-xl")}
          <span className="slide-rule" aria-hidden="true" />
          {text("subtitle", "slide-subtitle")}
        </div>
      );
      break;
    case "section":
      content = (
        <div className="slide-stack slide-section">
          <span className="slide-kicker" aria-hidden="true" />
          {text("title", "slide-title slide-title-xl")}
          {text("subtitle", "slide-subtitle")}
        </div>
      );
      break;
    case "quote":
      content = (
        <div className="slide-stack slide-centered slide-quote">
          <span className="slide-quote-mark" aria-hidden="true">
            “
          </span>
          {text("title", "slide-quote-text", true)}
          {text("subtitle", "slide-subtitle slide-quote-by")}
        </div>
      );
      break;
    case "two":
      content = (
        <div className="slide-stack">
          {text("title", "slide-title")}
          <div className="slide-columns">
            <div className="slide-column">{text("body", "slide-body", true)}</div>
            <div className="slide-column">{text("body2", "slide-body", true)}</div>
          </div>
        </div>
      );
      break;
    case "image":
      content = (
        <>
          {image("slide-image-full")}
          {(slide.title || slide.subtitle || editable) && (
            <div className="slide-caption">
              {text("title", "slide-title slide-caption-title")}
              {text("subtitle", "slide-subtitle")}
            </div>
          )}
        </>
      );
      break;
    case "image-text":
      content = (
        <div className="slide-split">
          {image("slide-image-half")}
          <div className="slide-stack">
            {text("title", "slide-title")}
            {text("body", "slide-body", true)}
          </div>
        </div>
      );
      break;
    case "blank":
      content = (
        <div className="slide-stack slide-centered">
          {image("slide-image-blank")}
          {text("body", "slide-body slide-body-center", true)}
        </div>
      );
      break;
    default:
      content = (
        <div className="slide-stack">
          {text("title", "slide-title")}
          {text("subtitle", "slide-subtitle slide-subtitle-sm")}
          {text("body", "slide-body", true)}
        </div>
      );
  }

  return (
    <div className={`slide-frame ${className}`}>
      <div
        className={`slide slide-layout-${slide.layout}`}
        data-theme={theme}
        data-align={slide.align}
        data-editable={editable}
        dir={slideDirection(slide)}
        style={themeVars(theme, slide)}
      >
        {content}
      </div>
    </div>
  );
}
