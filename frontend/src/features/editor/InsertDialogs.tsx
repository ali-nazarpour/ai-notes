/** Dialogs used by the "/" menu: paste a link (embed, image, audio, bookmark) and pick a page. */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { boardsApi, notesApi } from "../../api/endpoints";
import { docsApi, projectsApi } from "../../api/v4";
import {
  BoardIcon,
  BookIcon,
  EmbedIcon,
  NotesIcon,
  PageLinkIcon,
  RocketIcon,
  SearchIcon,
} from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { useI18n } from "../../i18n";
import { directMediaKind, EMBED_PROVIDERS, parseUrl, toEmbed } from "../../lib/embeds";

export type UrlKind = "embed" | "image" | "video" | "audio" | "bookmark";

export function UrlDialog({
  kind,
  onSubmit,
  onClose,
}: {
  kind: UrlKind;
  onSubmit: (url: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const parsed = parseUrl(url);
  const embed = kind === "embed" ? toEmbed(url) : null;
  const direct = directMediaKind(url);
  let problem: string | null = null;
  if (url.trim() && !parsed) problem = t("editor.url.invalid");
  else if (parsed && kind === "embed" && !embed) problem = t("editor.url.unknownProvider");
  else if (
    parsed &&
    (kind === "image" || kind === "video" || kind === "audio") &&
    parsed.protocol !== "https:"
  )
    problem = t("editor.url.httpsOnly");
  else if (parsed && kind !== "embed" && kind !== "bookmark" && direct !== kind)
    problem = t(`editor.url.notA.${kind}`);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed && !problem) onSubmit(parsed.href);
  }

  return (
    <Modal
      title={t(`editor.url.title.${kind}`)}
      icon={EmbedIcon}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="url-form" className="primary" disabled={!parsed || Boolean(problem)}>
            {t("common.add")}
          </button>
        </>
      }
    >
      <form id="url-form" className="stack" onSubmit={submit}>
        <label className="field">
          <span className="field-label">{t("editor.url.label")}</span>
          <input
            type="url"
            data-autofocus
            dir="ltr"
            placeholder="https://"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        {problem ? (
          <p className="error-text">{problem}</p>
        ) : embed ? (
          <p className="hint">{t("editor.url.detected", { provider: embed.provider })}</p>
        ) : null}
        {kind === "embed" && (
          <div className="provider-chips">
            {EMBED_PROVIDERS.map((name) => (
              <span key={name} className="chip">
                {name}
              </span>
            ))}
          </div>
        )}
        <p className="hint">{t(`editor.url.hint.${kind}`)}</p>
      </form>
    </Modal>
  );
}

export interface PageChoice {
  url: string;
  title: string;
  icon: string;
}

export function PagePicker({ onPick, onClose }: { onPick: (page: PageChoice) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const notes = useQuery({ queryKey: ["picker-notes"], queryFn: () => notesApi.list({}) });
  const docs = useQuery({ queryKey: ["picker-docs"], queryFn: docsApi.list });
  const projects = useQuery({ queryKey: ["picker-projects"], queryFn: () => projectsApi.list() });
  const boards = useQuery({ queryKey: ["picker-boards"], queryFn: boardsApi.list });

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (text: string) => !q || text.toLowerCase().includes(q);
    return [
      {
        label: t("nav.notes"),
        icon: NotesIcon,
        items: (notes.data ?? [])
          .filter((n) => match(n.title))
          .slice(0, 8)
          .map((n) => ({ url: `/notes/${n.id}`, title: n.title || t("notes.untitled"), icon: "📄" })),
      },
      {
        label: t("nav.docs"),
        icon: BookIcon,
        items: (docs.data ?? [])
          .filter((d) => match(d.title))
          .slice(0, 6)
          .map((d) => ({ url: `/docs/${d.id}`, title: d.title, icon: d.icon || "📘" })),
      },
      {
        label: t("nav.projects"),
        icon: RocketIcon,
        items: (projects.data ?? [])
          .filter((p) => match(p.name))
          .slice(0, 6)
          .map((p) => ({ url: `/projects/${p.id}`, title: p.name, icon: p.icon || "🚀" })),
      },
      {
        label: t("nav.boards"),
        icon: BoardIcon,
        items: (boards.data ?? [])
          .filter((b) => match(b.title))
          .slice(0, 6)
          .map((b) => ({ url: `/boards/${b.id}`, title: b.title, icon: "🗂️" })),
      },
    ].filter((group) => group.items.length);
  }, [query, notes.data, docs.data, projects.data, boards.data, t]);

  return (
    <Modal title={t("editor.block.pageLink")} icon={PageLinkIcon} onClose={onClose} size="lg">
      <div className="picker">
        <label className="search-field">
          <SearchIcon />
          <input
            data-autofocus
            value={query}
            placeholder={t("editor.pickPage")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="picker-groups">
          {groups.map(({ label, icon: GroupIcon, items }) => (
            <section key={label} className="picker-group">
              <p className="menu-heading">
                <GroupIcon /> {label}
              </p>
              {items.map((item) => (
                <button key={item.url} type="button" className="menu-item" onClick={() => onPick(item)}>
                  <span aria-hidden="true">{item.icon}</span>
                  <span className="menu-item-text" dir="auto">
                    {item.title}
                  </span>
                </button>
              ))}
            </section>
          ))}
          {!groups.length && <p className="muted">{t("common.noResults")}</p>}
        </div>
      </div>
    </Modal>
  );
}
