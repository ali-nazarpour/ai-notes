/**
 * A background chooser: tabs for groups (gradients, colors) and a grid of 20 tiles in two
 * rows of 10. Used for board and slide backgrounds.
 */
import { useState, type CSSProperties, type ReactNode } from "react";

import { CheckIcon } from "./Icons";

export interface BackgroundOption {
  value: string;
  style: CSSProperties;
  label: string;
}

export interface BackgroundGroup {
  id: string;
  label: string;
  options: BackgroundOption[];
}

export function BackgroundGrid({
  groups,
  value,
  onChange,
  label,
  extra,
  size = "md",
}: {
  groups: BackgroundGroup[];
  value: string | null;
  onChange: (value: string) => void;
  label: string;
  /** Shown in the tab row's end (e.g. "theme default" or "upload image"). */
  extra?: ReactNode;
  size?: "sm" | "md";
}) {
  const initial = groups.find((group) => group.options.some((option) => option.value === value)) ?? groups[0];
  const [tab, setTab] = useState(initial.id);
  const group = groups.find((item) => item.id === tab) ?? groups[0];
  return (
    <div className="bg-grid" data-size={size}>
      <div className="bg-grid-head">
        <div className="bg-grid-tabs" role="tablist" aria-label={label}>
          {groups.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === group.id}
              data-has-value={item.options.some((option) => option.value === value)}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {extra && <div className="bg-grid-extra">{extra}</div>}
      </div>
      <div className="bg-grid-tiles" role="radiogroup" aria-label={`${label}: ${group.label}`}>
        {group.options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              className="bg-tile"
              style={option.style}
              onClick={() => onChange(option.value)}
            >
              {selected && <CheckIcon />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
