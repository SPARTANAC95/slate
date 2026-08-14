import Dexie, { type Table } from 'dexie';
import type { DayNote, Entry, EntryKind } from '../types';

class SlateDB extends Dexie {
  entries!: Table<Entry, string>;
  dayNotes!: Table<DayNote, string>;

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
  }
}

export const db = new SlateDB();

const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type NewEntry = {
  title: string;
  kind: EntryKind;
  date: string | null;
  annual?: boolean;
  notes?: string;
  links?: string[];
  tags?: string[];
  series?: Entry['series'];
  external?: Entry['external'];
  dateSource?: 'manual' | 'api';
};

export async function addEntry(input: NewEntry): Promise<Entry> {
  const now = Date.now();
  const entry: Entry = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    kind: input.kind,
    date: input.date,
    annual: input.annual ?? false,
    dateHistory: [{ date: input.date, changedAt: now, source: input.dateSource ?? 'manual' }],
    done: false,
    rating: null,
    verdict: '',
    notes: input.notes ?? '',
    links: input.links ?? [],
    tags: input.tags ?? [],
    external: input.external ?? null,
    series: input.series ?? null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.entries.add(entry);
  return entry;
}

/**
 * The one write path for entries. A date change always appends to
 * dateHistory — the old date is never lost.
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
  if (expired.length) await db.entries.bulkDelete(expired.map((e) => e.id));
}

export async function saveDayNote(date: string, body: string): Promise<void> {
  if (body.trim() === '') {
    await db.dayNotes.delete(date);
  } else {
    await db.dayNotes.put({ date, body, updatedAt: Date.now() });
  }
}
