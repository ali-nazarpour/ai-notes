/**
 * Ask AI: conversations with history, answered only from your notes.
 *
 * - Scope: choose which categories (and uncategorized notes) the assistant may read.
 * - Deep thinking: the model reasons before answering (slower, usually more accurate).
 * - Every answer lists the notes it was given and marks the ones it cited; answers based
 *   on excerpts only or without any citation are flagged.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { chatsApi } from "../../api/endpoints";
import { queryKeys, useCategories, useChat, useChats } from "../../api/queries";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  AlertIcon,
  BrainIcon,
  ChatIcon,
  FilterIcon,
  HistoryIcon,
  InfoIcon,
  PlusIcon,
  SendIcon,
  SparkleIcon,
  TrashIcon,
  LockIcon,
} from "../../components/Icons";
import { Popover, Skeleton } from "../../components/ui";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useI18n } from "../../i18n";
import { errorMessage } from "../../i18n/errors";
import { categoryStyle } from "../../lib/palette";
import { useAccounts } from "../../store/accounts";
import { useVaultKey } from "../../store/vaultSession";
import { vaultHints } from "../vault/vaultHints";
import type { Category, Chat, ChatMessage, ChatReply, ChatScope, ChatSourceKind } from "../../types";
import { Answer, setSourceLabels, sourceLabel } from "./Answer";

const SOURCES: ChatSourceKind[] = [
  "notes",
  "docs",
  "projects",
  "boards",
  "tasks",
  "blog",
  "slides",
  "drive",
  "learn",
  "passwords",
];
/** By default the chatbot reads every part of the workspace. */
const ALL: ChatScope = { category_ids: null, include_uncategorized: true, sources: SOURCES };

function ScopePicker({
  scope,
  categories,
  onChange,
}: {
  scope: ChatScope;
  categories: Category[];
  onChange: (scope: ChatScope) => void;
}) {
  const { t, plural } = useI18n();
  const selected = new Set(scope.category_ids ?? categories.map((c) => c.id));
  const everything = scope.category_ids === null && scope.include_uncategorized;
  const extra = (scope.sources ?? ["notes"]).filter((kind) => kind !== "notes").length;
  const label =
    (everything
      ? t("chat.scope.all")
      : plural("chat.scope.some", selected.size + (scope.include_uncategorized ? 1 : 0))) +
    (extra ? ` · ${t("chat.scope.plus", { count: extra })}` : "");

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ids = categories.filter((c) => next.has(c.id)).map((c) => c.id);
    onChange({
      ...scope,
      category_ids: ids.length === categories.length ? null : ids,
    });
  };

  return (
    <Popover
      label={t("chat.scope.title")}
      trigger={({ open, toggle: toggleOpen }) => (
        <button type="button" className="chip scope-chip" aria-expanded={open} onClick={toggleOpen}>
          <FilterIcon />
          {label}
        </button>
      )}
    >
      {() => (
        <div className="scope-picker">
          <p className="menu-heading">{t("chat.scope.title")}</p>
          <p className="hint">{t("chat.scope.hint")}</p>
          <p className="menu-heading">{t("chat.scope.sources")}</p>
          <div className="source-toggle">
            {SOURCES.map((kind) => {
              const active = (scope.sources ?? ["notes"]).includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  className="chip"
                  aria-pressed={active}
                  onClick={() => {
                    const current = scope.sources ?? ["notes"];
                    const next = active ? current.filter((k) => k !== kind) : [...current, kind];
                    onChange({ ...scope, sources: next.length ? next : ["notes"] });
                  }}
                >
                  {t(`chat.source.${kind}`)}
                </button>
              );
            })}
          </div>
          <p className="menu-heading">{t("chat.scope.noteCategories")}</p>
          <button
            type="button"
            className="ghost small"
            onClick={() => onChange({ ...ALL, sources: scope.sources })}
          >
            {t("chat.scope.selectAll")}
          </button>
          {categories.map((category) => (
            <label key={category.id} className="check-row" style={categoryStyle(category.color)}>
              <input
                type="checkbox"
                checked={selected.has(category.id)}
                onChange={() => toggle(category.id)}
              />
              <span className="cat-dot" aria-hidden="true" />
              <span dir="auto">
                {category.icon} {category.name}
              </span>
            </label>
          ))}
          <label className="check-row">
            <input
              type="checkbox"
              checked={scope.include_uncategorized}
              onChange={(event) => onChange({ ...scope, include_uncategorized: event.target.checked })}
            />
            <span className="cat-dot" aria-hidden="true" />
            <span>{t("chat.scope.uncategorized")}</span>
          </label>
        </div>
      )}
    </Popover>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const { t } = useI18n();
  if (message.role === "user") {
    return (
      <div className="message message-user" dir="auto">
        {message.content}
      </div>
    );
  }
  const cited = new Set(message.cited_note_ids);
  return (
    <div className="message message-assistant">
      <span className="message-avatar" aria-hidden="true">
        <SparkleIcon />
      </span>
      <div className="message-body">
        <Answer text={message.content} sources={message.sources} />
        {message.partial && (
          <p className="message-note">
            <InfoIcon /> {t("chat.partial")}
          </p>
        )}
        {message.sources.length > 0 && message.cited_note_ids.length === 0 && (
          <p className="message-note warning">
            <AlertIcon /> {t("chat.noCitation")}
          </p>
        )}
        {message.sources.length > 0 && (
          <details className="message-sources">
            <summary>{t("chat.sources", { count: message.sources.length })}</summary>
            <ul>
              {message.sources.map((source) => (
                <li key={source.id}>
                  <Link to={source.url ?? `/notes/${source.id}`} dir="auto">
                    {sourceLabel(source) || t("notes.untitled")}
                  </Link>
                  {cited.has(source.id) && <span className="badge">{t("chat.cited")}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

export function ChatPage() {
  const i18n = useI18n();
  const { t, calendar } = i18n;
  const { chatId } = useParams();
  const id = chatId ? Number(chatId) : null;
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: chats = [], isLoading: chatsLoading } = useChats();
  const { data: chat, isLoading: chatLoading } = useChat(id);
  const { data: categories = [] } = useCategories();
  const [draftScope, setDraftScope] = useState<ChatScope>(ALL);
  const userId = useAccounts().active?.user.id ?? 0;
  setSourceLabels({
    passwords: t("chat.source.passwords"),
    tasks: t("chat.source.tasks"),
    drive: t("chat.source.driveFiles"),
  });
  const vaultKey = useVaultKey(userId);
  const [thorough, setThorough] = useLocalStorage("notes.aiThorough", false);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const scope = chat?.scope ?? draftScope;
  const setScope = (next: ChatScope) => {
    setDraftScope(next);
    if (chat) {
      client.setQueryData<Chat>(queryKeys.chat(chat.id), { ...chat, scope: next });
      void chatsApi.update(chat.id, { scope: next }).catch(() => undefined);
    }
  };

  const send = useMutation({
    mutationFn: async (content: string): Promise<ChatReply> => {
      let target = id;
      if (target === null) {
        const created = await chatsApi.create(scope);
        target = created.id;
      }
      const wantsPasswords = (scope.sources ?? SOURCES).includes("passwords");
      const vault = wantsPasswords ? await vaultHints(vaultKey).catch(() => []) : [];
      return chatsApi.send(target, content, scope, thorough, vault);
    },
    onSuccess: (reply) => {
      const key = queryKeys.chat(reply.conversation.id);
      const previous = client.getQueryData<Chat>(key);
      client.setQueryData<Chat>(key, {
        ...reply.conversation,
        messages: [...(previous?.messages ?? []), reply.user_message, reply.assistant_message],
      });
      client.invalidateQueries({ queryKey: queryKeys.chats });
      setPendingQuestion(null);
      if (id !== reply.conversation.id) navigate(`/chat/${reply.conversation.id}`, { replace: true });
    },
    onError: (err) => setError(errorMessage(err, i18n)),
  });

  const messages = chat?.messages ?? [];
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingQuestion]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || send.isPending) return;
    setError(null);
    setPendingQuestion(content);
    setInput("");
    send.mutate(content);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  async function remove(target: number) {
    const ok = await confirm({
      title: t("chat.deleteTitle"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await chatsApi.remove(target);
      client.invalidateQueries({ queryKey: queryKeys.chats });
      if (target === id) navigate("/chat");
    } catch (err) {
      toast(errorMessage(err, i18n), "error");
    }
  }

  const startNew = () => {
    setDraftScope(chat?.scope ?? ALL);
    setError(null);
    setPendingQuestion(null);
    setHistoryOpen(false);
    navigate("/chat");
  };

  const examples = [t("chat.example1"), t("chat.example2"), t("chat.example3")];

  return (
    <div className="chat-layout" data-history-open={historyOpen}>
      <aside className="chat-history" aria-label={t("chat.history")}>
        <button type="button" className="primary block" onClick={startNew}>
          <PlusIcon /> {t("chat.new")}
        </button>
        <p className="sidebar-heading">{t("chat.history")}</p>
        {chatsLoading && <Skeleton rows={4} height={36} />}
        {!chatsLoading && chats.length === 0 && <p className="hint">{t("chat.noHistory")}</p>}
        <ul className="chat-list">
          {chats.map((item) => (
            <li key={item.id} className={item.id === id ? "active" : undefined}>
              <Link to={`/chat/${item.id}`} onClick={() => setHistoryOpen(false)} dir="auto">
                <span className="chat-list-title">{item.title || t("chat.untitled")}</span>
                <span className="chat-list-date">{calendar.shortDate(item.updated_at)}</span>
              </Link>
              <button
                type="button"
                className="icon-button small danger"
                aria-label={t("chat.delete")}
                title={t("chat.delete")}
                onClick={() => void remove(item.id)}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat-main" aria-labelledby="chat-title">
        <div className="chat-header">
          <button
            type="button"
            className="icon-button history-toggle"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-label={t("chat.history")}
            aria-expanded={historyOpen}
          >
            <HistoryIcon />
          </button>
          <h1 id="chat-title" dir="auto">
            {chat?.title || t("chat.newTitle")}
          </h1>
        </div>

        <div className="chat-thread">
          {id !== null && chatLoading && <Skeleton rows={3} height={64} />}
          {messages.length === 0 && !pendingQuestion && !(id !== null && chatLoading) && (
            <div className="chat-intro">
              <span className="empty-icon">
                <ChatIcon />
              </span>
              <h2>{t("chat.introTitle")}</h2>
              <p className="muted">{t("chat.introHint")}</p>
              <div className="chips chips-wrap">
                {examples.map((example) => (
                  <button key={example} type="button" className="chip" onClick={() => setInput(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}
          {pendingQuestion && (
            <>
              <div className="message message-user" dir="auto">
                {pendingQuestion}
              </div>
              {send.isPending && (
                <div className="message message-assistant">
                  <span className="message-avatar" aria-hidden="true">
                    <SparkleIcon />
                  </span>
                  <div className="message-body typing" role="status">
                    <span className="typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    {thorough ? t("chat.thinking") : t("chat.reading")}
                  </div>
                </div>
              )}
            </>
          )}
          {error && (
            <div className="error-text" role="alert">
              {error}{" "}
              {pendingQuestion && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setInput(pendingQuestion);
                    setPendingQuestion(null);
                    setError(null);
                  }}
                >
                  {t("common.retry")}
                </button>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-composer" onSubmit={submit}>
          <div className="chat-composer-options">
            <ScopePicker scope={scope} categories={categories} onChange={setScope} />
            {(scope.sources ?? SOURCES).includes("passwords") && !vaultKey && (
              <Link to="/passwords" className="chip vault-hint" title={t("chat.vaultLockedHint")}>
                <LockIcon /> {t("chat.vaultLocked")}
              </Link>
            )}
            <label className="switch-row compact">
              <input
                type="checkbox"
                checked={thorough}
                onChange={(event) => setThorough(event.target.checked)}
              />
              <BrainIcon />
              <span>{t("ai.thorough")}</span>
            </label>
          </div>
          <div className="chat-input">
            <textarea
              rows={1}
              placeholder={t("chat.placeholder")}
              aria-label={t("chat.placeholder")}
              maxLength={2000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="submit"
              className="primary send-button"
              disabled={!input.trim() || send.isPending}
              aria-label={t("chat.send")}
            >
              <SendIcon />
            </button>
          </div>
          <p className="hint">{t("chat.disclaimer")}</p>
        </form>
      </section>
    </div>
  );
}
