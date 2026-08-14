import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './index';
import type { DayNote, Entry } from '../types';
import { occursOn } from '../lib/dates';

/** all live (non-deleted) entries; single-user scale, filter in memory */
export function useLiveEntries(): Entry[] | undefined {
  return useLiveQuery(() =>
    db.entries.filter((e) => e.deletedAt === null).toArray(),
  );
}

export function entriesOnDay(entries: Entry[], dayISO: string): Entry[] {
  return entries
    .filter((e) => occursOn(e.date, e.annual, dayISO))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * undefined = still loading. The result is tagged with the date it was
 * queried for — on a date switch, useLiveQuery briefly reports the previous
 * day's value, and callers must be able to tell.
 */
export function useDayNote(
  dateISO: string,
): { forDate: string; note: DayNote | null } | undefined {
  return useLiveQuery(
    async () => ({ forDate: dateISO, note: (await db.dayNotes.get(dateISO)) ?? null }),
    [dateISO],
  );
}
