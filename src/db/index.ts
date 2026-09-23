import Dexie, { type Table } from 'dexie';
import type { DayNote, Entry, EntryKind } from '../types';
import { knownRuntime } from '../lib/runtime';
import type { GoogleLink } from '../lib/googleCalendar';

class SlateDB extends Dexie {
  entries!: Table<Entry, string>;
  dayNotes!: Table<DayNote, string>;
  googleLinks!: Table<GoogleLink, string>;

  constructor() {
    super('slate');
    this.version(1).stores({
      entries: 'id, date, kind, updatedAt',
      dayNotes: 'date',
    });
    // v2: entries grew a non-indexed `links` field
    this.version(2).upgrade((tx) =>
      tx.table('entries').toCollection().modify((e) => {
        if (!Array.isArray(e.links)) e.links = [];
      }),
    );
    // v3: entries grew `runtimeMin`
    this.version(3).upgrade((tx) =>
      tx.table('entries').toCollection().modify((e) => {
        if (e.runtimeMin === undefined) e.runtimeMin = null;
      }),
    );
    // v4: entries grew `datePinned` and `time`. Anything whose last date
    // change was mine is pinned on the way in — that date was already a
    // deliberate choice, and the refresh should have been leaving it alone.
    this.version(4).upgrade((tx) =>
      tx.table('entries').toCollection().modify((e) => {
        if (e.time === undefined) e.time = null;
        if (e.datePinned !== undefined) return;
        const last = e.dateHistory?.[e.dateHistory.length - 1];
        e.datePinned = e.date !== null && (last === undefined || last.source === 'manual');
      }),
    );
    this.version(5).stores({ googleLinks: 'key, calendarId, entryId' });
  }
}

export const db = new SlateDB();

const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type NewEntry = {
  title: string;
  kind: EntryKind;
  date: string | null;
  time?: string | null;
  annual?: boolean;
  notes?: string;
  links?: string[];
  tags?: string[];
  series?: Entry['series'];
  external?: Entry['external'];
  runtimeMin?: number | null;
  dateSource?: 'manual' | 'api';
  datePinned?: boolean;
};

/**
 * A date I typed is mine to keep. A date left empty is not a choice — a TBA
 * release must still be free to land when the provider announces it.
 */
const pinnedFor = (input: NewEntry): boolean =>
  input.datePinned ?? (input.date !== null && (input.dateSource ?? 'manual') === 'manual');

export async function addEntry(input: NewEntry): Promise<Entry> {
  const now = Date.now();
  const entry: Entry = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    kind: input.kind,
    date: input.date,
    time: input.time ?? null,
    annual: input.annual ?? false,
    datePinned: pinnedFor(input),
    dateHistory: [{ date: input.date, changedAt: now, source: input.dateSource ?? 'manual' }],
    done: false,
    rating: null,
    verdict: '',
    notes: input.notes ?? '',
    links: input.links ?? [],
    tags: input.tags ?? [],
    external: input.external ?? null,
    runtimeMin: knownRuntime(input.runtimeMin),
    series: input.series ?? null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.entries.add(entry);
  return entry;
}

/** add many at once — used by the whole-season add */
export async function addEntries(inputs: NewEntry[]): Promise<number> {
  const now = Date.now();
  const rows: Entry[] = inputs.map((input, i) => ({
    id: crypto.randomUUID(),
    title: input.title.trim(),
    kind: input.kind,
    date: input.date,
    time: input.time ?? null,
    annual: input.annual ?? false,
    datePinned: pinnedFor(input),
    dateHistory: [{ date: input.date, changedAt: now, source: input.dateSource ?? 'manual' }],
    done: false,
    rating: null,
    verdict: '',
    notes: input.notes ?? '',
    links: input.links ?? [],
    tags: input.tags ?? [],
    external: input.external ?? null,
    runtimeMin: knownRuntime(input.runtimeMin),
    series: input.series ?? null,
    deletedAt: null,
    // keep insertion order stable when they sort by createdAt
    createdAt: now + i,
    updatedAt: now + i,
  }));
  await db.entries.bulkAdd(rows);
  return rows.length;
}

/**
 * The one write path for entries. A date change always appends to
 * dateHistory — the old date is never lost — and moving a date by hand
 * (editor, drag, "schedule today") pins it, so the next provider refresh
 * leaves it alone. Pass `datePinned` in the patch to override that.
 */
export async function updateEntry(
  id: string,
  patch: Partial<Omit<Entry, 'id' | 'createdAt' | 'dateHistory'>>,
  dateSource: 'manual' | 'api' = 'manual',
): Promise<void> {
  await db.transaction('rw', db.entries, async () => {
    const current = await db.entries.get(id);
    if (!current) return;
    const next: Partial<Entry> = { ...patch, updatedAt: Date.now() };
    if ('date' in patch && patch.date !== current.date) {
      next.dateHistory = [
        ...current.dateHistory,
        { date: patch.date ?? null, changedAt: Date.now(), source: dateSource },
      ];
      if (dateSource === 'manual' && patch.datePinned === undefined) next.datePinned = true;
    }
    await db.entries.update(id, next);
  });
}

export async function softDeleteEntry(id: string): Promise<void> {
  await db.entries.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

export async function restoreEntry(id: string): Promise<void> {
  await db.entries.update(id, { deletedAt: null, updatedAt: Date.now() });
}

/** hard-delete anything soft-deleted more than 30 days ago; run on app open */
export async function purgeExpiredDeleted(): Promise<void> {
  const cutoff = Date.now() - DELETED_RETENTION_MS;
  const expired = await db.entries
    .filter((e) => e.deletedAt !== null && e.deletedAt < cutoff)
    .toArray();
  // Keep unsent cloud deletions until Google has acknowledged them, including
  // when this machine has been offline for longer than the normal retention.
  const links = await db.googleLinks.toArray();
  const pending = new Set(links.filter((link) => !link.deleted).map((link) => link.entryId));
  const safe = expired.filter((e) => !pending.has(e.id));
  if (safe.length) await db.entries.bulkDelete(safe.map((e) => e.id));
}

export async function saveDayNote(date: string, body: string): Promise<void> {
  if (body.trim() === '') {
    await db.dayNotes.delete(date);
  } else {
    await db.dayNotes.put({ date, body, updatedAt: Date.now() });
  }
}
