import { describe, expect, it } from "vitest";

import { en } from "./en";
import { fa } from "./fa";

describe("translations", () => {
  it("Persian has every English key and no empty strings", () => {
    const missing = Object.keys(en).filter((key) => !(key in fa));
    expect(missing).toEqual([]);
    const empty = Object.entries(fa).filter(([, value]) => !String(value).trim());
    expect(empty).toEqual([]);
  });

  it("keeps the same {placeholders} in both languages", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const mismatched = Object.keys(en).filter(
      (key) => names(en[key as keyof typeof en]).join() !== names(fa[key as keyof typeof fa]).join(),
    );
    expect(mismatched).toEqual([]);
  });
});
