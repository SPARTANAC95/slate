export type EntryKind = 'game' | 'film' | 'series' | 'event' | 'note' | 'task';

export type DateChange = {
  date: string | null;
  changedAt: number;
  source: 'manual' | 'api';
};

export type Entry = {
  id: string;
  title: string;
  kind: EntryKind;
  /** null = backlog: I want this but there's no date yet */
  date: string | null; // 'YYYY-MM-DD'
  /** repeats on the same month/day every year */
  annual: boolean;
  /** every date this entry has ever had, oldest first. Never overwrite — append. */
  dateHistory: DateChange[];
  /** true once the date has passed AND I've marked it done */
  done: boolean;
  /** 1-5, only meaningful after done */
  rating: number | null;
  /** my verdict after the fact, one or two lines */
  verdict: string;
  /** free-form, written before the date */
  notes: string;
  /** related urls — trailer, store page, article */
  links: string[];
  tags: string[];
  /** links to external metadata if it came from an API */
  external: { source: 'tmdb' | 'rawg'; id: string; posterUrl: string | null } | null;
  /** for series only */
  series: { season: number; episode: number } | null;
  /** soft delete: set when deleted, purged after 30 days */
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

/** one free-form journal entry per calendar day, independent of Entries */
export type DayNote = {
  date: string; // 'YYYY-MM-DD', primary key
  body: string;
  updatedAt: number;
};

export const KIND_ORDER: EntryKind[] = ['game', 'film', 'series', 'event', 'task', 'note'];
