/** Types for the drive, presentations, language learning and the global search. */
import type { ColorName } from "./types";

// ---------------------------------------------------------------- drive

export type DriveView = "folder" | "recent" | "starred" | "trash" | "shared" | "search";

export interface DriveItem {
  id: number;
  parent_id: number | null;
  is_folder: boolean;
  section: DriveSection;
  project_id: number | null;
  name: string;
  kind: string; // image | video | audio | file | "" (folder)
  content_type: string;
  size: number;
  color: string | null;
  description: string;
  starred: boolean;
  trashed_at: string | null;
  link_enabled: boolean;
  url: string | null;
  owner_name: string;
  item_count: number;
  shared_count: number;
  created_at: string;
  updated_at: string;
}

export interface DriveCrumb {
  id: number;
  name: string;
}

export interface DriveListing {
  folder: DriveItem | null;
  path: DriveCrumb[];
  items: DriveItem[];
  role: string;
}

export interface DriveUsage {
  used: number;
  quota: number;
  max_file: number;
  files: number;
  folders: number;
  by_kind: Record<string, number>;
  blocked_extensions: string[];
}

export interface DriveFolder {
  id: number;
  name: string;
  parent_id: number | null;
  color: string | null;
}

export interface PublicDrive {
  root: DriveItem;
  folder: DriveItem;
  path: DriveCrumb[];
  items: DriveItem[];
  workspace_name: string;
}

export interface DriveSettings {
  max_file_mb: number;
  workspace_quota_mb: number;
  blocked_extensions: string[];
}

// ---------------------------------------------------------------- slides

export type SlideLayout =
  "title" | "content" | "image" | "image-text" | "quote" | "section" | "two" | "blank";
export type SlideTheme = "aurora" | "midnight" | "paper" | "sunset" | "forest" | "ocean" | "mono" | "candy";
export type SlideTransition = "none" | "fade" | "slide" | "zoom" | "flip";

export interface Slide {
  id: string;
  layout: SlideLayout;
  title: string;
  subtitle: string;
  body: string;
  body2: string;
  image: string | null;
  image_fit: "cover" | "contain";
  background: string | null;
  text_color: string | null;
  align: "start" | "center";
  notes: string;
  duration: number;
  hidden: boolean;
}

export interface DeckSummary {
  id: number;
  title: string;
  description: string;
  theme: SlideTheme;
  slide_count: number;
  first_slide: Slide | null;
  has_music: boolean;
  starred: boolean;
  category_id: number | null;
  updated_at: string;
  created_at: string;
}

export interface Deck {
  id: number;
  title: string;
  description: string;
  theme: SlideTheme;
  transition: SlideTransition;
  auto_seconds: number;
  loop: boolean;
  music_url: string | null;
  music_name: string;
  music_volume: number;
  slides: Slide[];
  category_id: number | null;
  starred: boolean;
  role: string;
  updated_at: string;
  created_at: string;
}

export type DeckChanges = Partial<Omit<Deck, "id" | "role" | "updated_at" | "created_at">>;

// ---------------------------------------------------------------- language learning

export type LangCode =
  "en" | "fa" | "de" | "fr" | "es" | "it" | "pt" | "ar" | "tr" | "ru" | "zh" | "ja" | "ko" | "nl" | "hi";

export interface LangDeck {
  id: number;
  name: string;
  description: string;
  source_lang: LangCode;
  target_lang: LangCode;
  color: ColorName;
  icon: string;
  new_per_day: number;
  total: number;
  new: number;
  learning: number;
  due: number;
  mastered: number;
  created_at: string;
  updated_at: string;
}

export interface CardFields {
  front: string;
  back: string;
  pronunciation: string;
  part_of_speech: string;
  example: string;
  example_translation: string;
  notes: string;
  image: string | null;
  tags: string[];
}

export interface LangCard extends CardFields {
  id: number;
  deck_id: number;
  starred: boolean;
  state: "new" | "learning" | "review";
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_at: string | null;
  last_review_at: string | null;
  created_at: string;
  previews: Record<string, number>;
}

export interface StudyQueue {
  cards: LangCard[];
  due: number;
  new: number;
}

export interface LangStats {
  total: number;
  new: number;
  learning: number;
  due: number;
  mastered: number;
  reviews_today: number;
  correct_today: number;
  streak: number;
  best_streak: number;
  days: Record<string, number>;
}

export interface SongLine {
  time: number | null;
  text: string;
  translation: string;
}

export interface Song {
  id: number;
  title: string;
  artist: string;
  source_lang: LangCode;
  target_lang: LangCode;
  deck_id: number | null;
  media_url: string | null;
  youtube_url: string | null;
  cover: string | null;
  lines: SongLine[];
  created_at: string;
  updated_at: string;
}

export type SongChanges = Partial<Omit<Song, "id" | "created_at" | "updated_at">>;

// ---------------------------------------------------------------- search

export interface SearchResult {
  kind: string;
  id: number | string;
  title: string;
  snippet: string;
  url: string;
  icon: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------- alarms

export type AlarmRepeat = "once" | "daily" | "weekdays" | "weekly" | "monthly";
export type AlarmSound = "chime" | "bell" | "beep" | "digital" | "soft";

export interface Alarm {
  id: number;
  title: string;
  note: string;
  time: string; // "HH:MM"
  date: string | null; // ISO date for one-time (and the day of month for monthly)
  repeat: AlarmRepeat;
  weekdays: number[]; // 0 = Sunday ... 6 = Saturday
  enabled: boolean;
  sound: AlarmSound;
  color: ColorName;
  link: string | null;
  last_fired_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
}

export type AlarmInput = Pick<
  Alarm,
  "title" | "note" | "time" | "date" | "repeat" | "weekdays" | "enabled" | "sound" | "color" | "link"
>;

// ---------------------------------------------------------------- projects: links, calendar

export type LinkKind = "note" | "task" | "board" | "doc" | "deck" | "drive";

export interface LinkedItem {
  kind: LinkKind;
  id: number;
  title: string;
  subtitle: string;
  url: string;
  icon: string;
  done: boolean;
  date: string | null;
  project_id: number | null;
}

export interface CalendarEvent {
  id: string;
  kind: "project_start" | "project_end" | "milestone" | "card" | "alarm";
  date: string;
  title: string;
  subtitle: string;
  url: string;
  color: ColorName;
  done: boolean;
}

export type DriveSection = "files" | "music" | "videos" | "photos" | "documents";
