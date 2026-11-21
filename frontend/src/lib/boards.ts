/**
 * Board helpers: backgrounds ("gradient:<name>", "color:<palette name>" or an uploaded
 * image), card covers, due-date status, and pure functions that apply moves to a board so
 * the UI can update instantly before the server confirms.
 */
import type { CSSProperties } from "react";

import type { Board, BoardListData, CardSummary } from "../types";
import { addDays, today } from "./calendar";
import { coverStyle, GRADIENTS } from "./covers";
import { COLORS, paletteColor } from "./palette";

/** The board backgrounds use the app's 20 gradients (the same as note covers). */
export const BOARD_GRADIENTS: Record<string, string> = GRADIENTS;

export const BOARD_BACKGROUNDS = [
  ...Object.keys(BOARD_GRADIENTS).map((name) => `gradient:${name}`),
  ...COLORS.map((color) => `color:${color.name}`),
];

export function boardBackgroundStyle(background: string): CSSProperties {
  if (background.startsWith("gradient:")) {
    const gradient = BOARD_GRADIENTS[background.slice(9)];
    if (gradient) return { backgroundImage: gradient };
  }
  if (background.startsWith("color:")) {
    const color = paletteColor(background.slice(6) as never);
    return { backgroundColor: color.hex };
  }
  return coverStyle(background) ?? { backgroundImage: BOARD_GRADIENTS.ocean };
}

/** Light backgrounds need dark header text. */
export function isLightBackground(background: string): boolean {
  return [
    "gradient:peach",
    "gradient:lavender",
    "gradient:mint",
    "gradient:alpine",
    "gradient:candy",
  ].includes(background);
}

export function cardCoverStyle(cover: string | null): CSSProperties | undefined {
  if (!cover) return undefined;
  if (cover.startsWith("color:")) return { backgroundColor: paletteColor(cover.slice(6) as never).hex };
  return coverStyle(cover);
}

export type DueStatus = "done" | "overdue" | "today" | "soon" | "later";

export function dueStatus(card: Pick<CardSummary, "due_date" | "due_done">): DueStatus | null {
  if (!card.due_date) return null;
  if (card.due_done) return "done";
  const now = today();
  if (card.due_date < now) return "overdue";
  if (card.due_date === now) return "today";
  if (card.due_date <= addDays(now, 2)) return "soon";
  return "later";
}

/** Returns the board with a card moved to `listId` at `index` (positions renumbered). */
export function moveCardLocally(board: Board, cardId: number, listId: number, index: number): Board {
  let moving: CardSummary | undefined;
  const without = board.lists.map((list) => {
    const found = list.cards.find((card) => card.id === cardId);
    if (found) moving = found;
    return found ? { ...list, cards: list.cards.filter((card) => card.id !== cardId) } : list;
  });
  if (!moving) return board;
  const card = { ...moving, list_id: listId };
  return {
    ...board,
    lists: without.map((list) => {
      if (list.id !== listId) return renumber(list);
      const cards = [...list.cards];
      cards.splice(Math.min(index, cards.length), 0, card);
      return renumber({ ...list, cards });
    }),
  };
}

export function moveListLocally(board: Board, listId: number, index: number): Board {
  const lists = board.lists.filter((list) => list.id !== listId);
  const moving = board.lists.find((list) => list.id === listId);
  if (!moving) return board;
  lists.splice(Math.min(index, lists.length), 0, moving);
  return { ...board, lists: lists.map((list, position) => ({ ...list, position })) };
}

function renumber(list: BoardListData): BoardListData {
  return { ...list, cards: list.cards.map((card, position) => ({ ...card, position })) };
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
