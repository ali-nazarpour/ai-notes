import { describe, expect, it } from "vitest";

import { directionOf } from "../features/editor/BlockDirection";
import { ageOn } from "../features/settings/ProfileSection";
import { describeDevice } from "../features/settings/SecuritySection";
import type { Board, CardSummary } from "../types";
import { dueStatus, moveCardLocally, moveListLocally } from "./boards";
import { addDays, today } from "./calendar";
import { generatePassphrase, generatePassword, passwordStrength } from "./passwords";
import {
  createKeyMaterial,
  decryptJson,
  encryptJson,
  unlockKey,
  WrongMasterPasswordError,
} from "./vaultCrypto";

describe("vault crypto", () => {
  it("encrypts, decrypts and rejects a wrong master password", async () => {
    const { key, setup } = await createKeyMaterial("correct horse battery staple");
    const secret = { title: "Gmail", password: "p@ss" };
    const blob = await encryptJson(key, secret);
    expect(blob).not.toContain("p@ss");
    expect(await decryptJson(key, blob)).toEqual(secret);

    const status = { configured: true, item_count: 1, ...setup };
    const again = await unlockKey("correct horse battery staple", status);
    expect(await decryptJson(again, blob)).toEqual(secret);
    await expect(unlockKey("wrong", status)).rejects.toBeInstanceOf(WrongMasterPasswordError);
  }, 30_000);

  it("uses a fresh IV for every encryption", async () => {
    const { key } = await createKeyMaterial("another long password");
    expect(await encryptJson(key, "same")).not.toBe(await encryptJson(key, "same"));
  }, 30_000);
});

describe("passwords", () => {
  it("generates passwords with every selected character group", () => {
    const options = {
      length: 24,
      lower: true,
      upper: true,
      digits: true,
      symbols: true,
      avoidAmbiguous: true,
    };
    for (let i = 0; i < 20; i++) {
      const value = generatePassword(options);
      expect(value).toHaveLength(24);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/\d/);
      expect(value).toMatch(/[^A-Za-z0-9]/);
      expect(value).not.toMatch(/[0O1lI|]/);
    }
  });

  it("builds passphrases from words", () => {
    expect(generatePassphrase(4).split("-")).toHaveLength(5);
  });

  it("rates strength", () => {
    expect(passwordStrength("password123").level).toBe(0);
    expect(passwordStrength("abc").level).toBe(0);
    expect(passwordStrength("Tr0ub4dor&3xyz!").level).toBeGreaterThanOrEqual(3);
    expect(passwordStrength(generatePassword()).level).toBe(4);
  });
});

function card(id: number, listId: number, extra: Partial<CardSummary> = {}): CardSummary {
  return {
    id,
    list_id: listId,
    title: `C${id}`,
    position: 0,
    label_ids: [],
    start_date: null,
    due_date: null,
    due_done: false,
    cover: null,
    archived: false,
    has_description: false,
    checklist_done: 0,
    checklist_total: 0,
    comment_count: 0,
    attachment_count: 0,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

const board: Board = {
  id: 1,
  title: "B",
  description: "",
  background: "gradient:ocean",
  starred: false,
  list_count: 2,
  card_count: 3,
  created_at: "",
  updated_at: "",
  labels: [],
  lists: [
    { id: 10, title: "A", position: 0, color: null, wip_limit: null, cards: [card(1, 10), card(2, 10)] },
    { id: 20, title: "B", position: 1, color: null, wip_limit: null, cards: [card(3, 20)] },
  ],
};

describe("board moves", () => {
  it("moves a card between lists and renumbers positions", () => {
    const next = moveCardLocally(board, 1, 20, 1);
    expect(next.lists[0].cards.map((c) => c.id)).toEqual([2]);
    expect(next.lists[1].cards.map((c) => [c.id, c.list_id, c.position])).toEqual([
      [3, 20, 0],
      [1, 20, 1],
    ]);
  });

  it("reorders inside a list and moves lists", () => {
    expect(moveCardLocally(board, 2, 10, 0).lists[0].cards.map((c) => c.id)).toEqual([2, 1]);
    expect(moveListLocally(board, 20, 0).lists.map((l) => [l.id, l.position])).toEqual([
      [20, 0],
      [10, 1],
    ]);
  });

  it("classifies due dates", () => {
    expect(dueStatus(card(1, 1, { due_date: addDays(today(), -1) }))).toBe("overdue");
    expect(dueStatus(card(1, 1, { due_date: today() }))).toBe("today");
    expect(dueStatus(card(1, 1, { due_date: addDays(today(), 30) }))).toBe("later");
    expect(dueStatus(card(1, 1, { due_date: addDays(today(), -1), due_done: true }))).toBe("done");
    expect(dueStatus(card(1, 1))).toBeNull();
  });
});

describe("misc helpers", () => {
  it("detects block direction from the first letter", () => {
    expect(directionOf("سلام world")).toBe("rtl");
    expect(directionOf("Hello دنیا")).toBe("ltr");
    expect(directionOf("123 - ۴۵")).toBeNull();
    expect(directionOf("")).toBeNull();
  });

  it("computes age on a date", () => {
    expect(ageOn("2000-03-21", "2026-03-20")).toBe(25);
    expect(ageOn("2000-03-21", "2026-03-21")).toBe(26);
  });

  it("describes devices", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      ),
    ).toBe("Chrome · Windows");
    expect(describeDevice("")).toBe("");
  });
});
