/** Icons and labels for each kind of global search result. */
import {
  AlarmIcon,
  BotIcon,
  TagIcon,
  BoardIcon,
  BookIcon,
  CheckCircleIcon,
  DriveIcon,
  FileIcon,
  GraduationIcon,
  type IconComponent,
  LyricsIcon,
  NotesIcon,
  PenIcon,
  RocketIcon,
  SlidesIcon,
  TodoIcon,
} from "../components/Icons";
import type { TranslationKey } from "../i18n";

export const SEARCH_KINDS: Record<string, { icon: IconComponent; label: TranslationKey }> = {
  note: { icon: NotesIcon, label: "search.kind.note" },
  task: { icon: CheckCircleIcon, label: "search.kind.task" },
  board: { icon: BoardIcon, label: "search.kind.board" },
  card: { icon: TodoIcon, label: "search.kind.card" },
  doc: { icon: BookIcon, label: "search.kind.doc" },
  doc_page: { icon: FileIcon, label: "search.kind.doc_page" },
  post: { icon: PenIcon, label: "search.kind.post" },
  project: { icon: RocketIcon, label: "search.kind.project" },
  drive: { icon: DriveIcon, label: "search.kind.drive" },
  deck: { icon: SlidesIcon, label: "search.kind.deck" },
  lang_deck: { icon: GraduationIcon, label: "search.kind.lang_deck" },
  lang_card: { icon: GraduationIcon, label: "search.kind.lang_card" },
  song: { icon: LyricsIcon, label: "search.kind.song" },
  category: { icon: TagIcon, label: "search.kind.category" },
  chat: { icon: BotIcon, label: "search.kind.chat" },
  alarm: { icon: AlarmIcon, label: "search.kind.alarm" },
};

export const SEARCH_ORDER = Object.keys(SEARCH_KINDS);
