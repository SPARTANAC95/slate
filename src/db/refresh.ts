import { db, updateEntry } from './index';
import { fetchCurrentDate } from '../lib/lookup';
import { todayISO } from '../lib/dates';

/**
 * Re-check every non-done entry that came from an API. A moved date is
 * written through updateEntry, so it lands in dateHistory as source 'api'.
 * A provider returning no date (TBA) never clears an existing one.
 */
export async function refreshExternalDates(): Promise<{ checked: number; moved: number }> {
  const entries = await db.entries
    .filter((e) => e.deletedAt === null && !e.done && e.external !== null)
    .toArray();
  let moved = 0;
  for (const e of entries) {
    const date = await fetchCurrentDate({
      source: e.external!.source,
      kind: e.kind,
      id: e.external!.id,
      season: e.series?.season,
      episode: e.series?.episode,
    });
    if (date !== null && date !== e.date) {
      await updateEntry(e.id, { date }, 'api');
      moved++;
    }
  }
  return { checked: entries.length, moved };
}

const KEY = 'slate:lastRefreshDay';

export const shouldAutoRefresh = (): boolean => localStorage.getItem(KEY) !== todayISO();

export const markRefreshed = (): void => localStorage.setItem(KEY, todayISO());
