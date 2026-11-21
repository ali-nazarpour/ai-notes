/** Edit the board's labels: name and color; add and delete. */
import { useState } from "react";

import { PlusIcon, TagIcon, TrashIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { ColorPicker } from "../../components/ui";
import { useI18n } from "../../i18n";
import { newId } from "../../lib/boards";
import { paletteColor } from "../../lib/palette";
import type { Board, BoardLabel } from "../../types";
import { useBoardActions } from "./useBoardActions";

export function LabelsManager({ board, onClose }: { board: Board; onClose: () => void }) {
  const { t } = useI18n();
  const actions = useBoardActions(board.id);
  const [labels, setLabels] = useState<BoardLabel[]>(board.labels);
  const [open, setOpen] = useState<string | null>(null);
  const dirty = JSON.stringify(labels) !== JSON.stringify(board.labels);

  const update = (id: string, changes: Partial<BoardLabel>) =>
    setLabels(labels.map((label) => (label.id === id ? { ...label, ...changes } : label)));

  return (
    <Modal
      title={t("boards.manageLabels")}
      icon={TagIcon}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!dirty}
            onClick={() => {
              void actions.updateBoard({ labels: labels.map((l) => ({ ...l, name: l.name.trim() })) });
              onClose();
            }}
          >
            {t("common.save")}
          </button>
        </>
      }
    >
      <ul className="labels-editor">
        {labels.map((label) => (
          <li key={label.id}>
            <div className="labels-editor-row">
              <button
                type="button"
                className="label-color-button"
                style={{ background: paletteColor(label.color).hex }}
                aria-expanded={open === label.id}
                aria-label={t("categories.color")}
                onClick={() => setOpen(open === label.id ? null : label.id)}
              />
              <input
                type="text"
                maxLength={40}
                placeholder={t("boards.labelName")}
                value={label.name}
                onChange={(event) => update(label.id, { name: event.target.value })}
              />
              <button
                type="button"
                className="icon-button small danger"
                aria-label={t("common.delete")}
                onClick={() => setLabels(labels.filter((l) => l.id !== label.id))}
              >
                <TrashIcon />
              </button>
            </div>
            {open === label.id && (
              <ColorPicker
                size="sm"
                label={t("categories.color")}
                value={label.color}
                onChange={(color) => update(label.id, { color })}
              />
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="small"
        disabled={labels.length >= 30}
        onClick={() => {
          const id = newId();
          setLabels([...labels, { id, name: "", color: "teal" }]);
          setOpen(id);
        }}
      >
        <PlusIcon /> {t("boards.newLabel")}
      </button>
    </Modal>
  );
}
