/**
 * Board mutations with optimistic cache updates. The board query is the source of truth
 * for the canvas; card details have their own query and are mirrored into the board.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { boardsApi, type BoardChanges, type ListChanges } from "../../api/endpoints";
import { queryKeys } from "../../api/queries";
import { useToast } from "../../components/Feedback";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import type { Board, CardChanges, CardDetail, CardSummary } from "../../types";

export function toSummary(card: CardDetail): CardSummary {
  const {
    description: _d,
    description_text: _t,
    checklists: _c,
    attachments: _a,
    comments: _m,
    ...summary
  } = card;
  return summary;
}

export function useBoardActions(boardId: number) {
  const client = useQueryClient();
  const toast = useToast();
  const i18n = useI18n();
  const key = queryKeys.board(boardId);

  const fail = useCallback(
    (error: unknown) => {
      toast(errorMessage(error, i18n), "error");
      void client.invalidateQueries({ queryKey: key });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, toast, i18n, boardId],
  );

  return useMemo(() => {
    const setBoard = (update: (board: Board) => Board) =>
      client.setQueryData<Board>(key, (old) => (old ? update(old) : old));

    const mirrorCard = (card: CardDetail) => {
      client.setQueryData(queryKeys.card(boardId, card.id), card);
      setBoard((board) => {
        const summary = toSummary(card);
        const lists = board.lists.map((list) => ({
          ...list,
          cards: list.cards.filter((c) => c.id !== card.id),
        }));
        if (card.archived) return { ...board, lists };
        return {
          ...board,
          lists: lists.map((list) => {
            if (list.id !== card.list_id) return list;
            const cards = [...list.cards];
            cards.splice(Math.min(summary.position, cards.length), 0, summary);
            return { ...list, cards };
          }),
        };
      });
    };

    const refreshBoards = () => client.invalidateQueries({ queryKey: queryKeys.boards });

    return {
      setBoard,
      mirrorCard,

      async updateBoard(changes: BoardChanges) {
        setBoard((board) => ({ ...board, ...changes }));
        try {
          client.setQueryData(key, await boardsApi.update(boardId, changes));
          void refreshBoards();
        } catch (error) {
          fail(error);
        }
      },

      async addList(title: string) {
        try {
          const list = await boardsApi.createList(boardId, title);
          setBoard((board) => ({ ...board, lists: [...board.lists, { ...list, cards: [] }] }));
        } catch (error) {
          fail(error);
        }
      },

      async updateList(listId: number, changes: ListChanges) {
        setBoard((board) => ({
          ...board,
          lists: board.lists.map((list) =>
            list.id === listId ? { ...list, ...changes, position: list.position } : list,
          ),
        }));
        try {
          await boardsApi.updateList(boardId, listId, changes);
          if (changes.index !== undefined) void client.invalidateQueries({ queryKey: key });
        } catch (error) {
          fail(error);
        }
      },

      async removeList(listId: number) {
        setBoard((board) => ({ ...board, lists: board.lists.filter((list) => list.id !== listId) }));
        try {
          await boardsApi.removeList(boardId, listId);
          void refreshBoards();
        } catch (error) {
          fail(error);
        }
      },

      async addCard(listId: number, title: string) {
        const tempId = -Date.now();
        const now = new Date().toISOString();
        setBoard((board) => ({
          ...board,
          lists: board.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  cards: [
                    ...list.cards,
                    {
                      id: tempId,
                      list_id: listId,
                      title,
                      position: list.cards.length,
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
                      created_at: now,
                      updated_at: now,
                    },
                  ],
                }
              : list,
          ),
        }));
        try {
          const card = await boardsApi.createCard(boardId, listId, title);
          setBoard((board) => ({
            ...board,
            lists: board.lists.map((list) => ({
              ...list,
              cards: list.cards.map((c) => (c.id === tempId ? toSummary(card) : c)),
            })),
          }));
          void refreshBoards();
        } catch (error) {
          fail(error);
        }
      },

      async updateCard(cardId: number, changes: CardChanges): Promise<CardDetail | null> {
        try {
          const card = await boardsApi.updateCard(boardId, cardId, changes);
          mirrorCard(card);
          return card;
        } catch (error) {
          fail(error);
          return null;
        }
      },

      async moveCard(cardId: number, listId: number, index: number) {
        try {
          const card = await boardsApi.updateCard(boardId, cardId, { list_id: listId, index });
          client.setQueryData(queryKeys.card(boardId, card.id), card);
        } catch (error) {
          fail(error);
        }
      },

      async moveList(listId: number, index: number) {
        try {
          await boardsApi.updateList(boardId, listId, { index });
        } catch (error) {
          fail(error);
        }
      },

      async removeCard(cardId: number) {
        setBoard((board) => ({
          ...board,
          lists: board.lists.map((list) => ({ ...list, cards: list.cards.filter((c) => c.id !== cardId) })),
        }));
        try {
          await boardsApi.removeCard(boardId, cardId);
          void refreshBoards();
        } catch (error) {
          fail(error);
        }
      },

      async copyCard(cardId: number) {
        try {
          await boardsApi.copyCard(boardId, cardId);
          await client.invalidateQueries({ queryKey: key });
        } catch (error) {
          fail(error);
        }
      },

      async reload() {
        await client.invalidateQueries({ queryKey: key });
        void refreshBoards();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, boardId, fail]);
}
