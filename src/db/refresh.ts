import { db, updateEntry } from './index';
import { fetchDetails } from '../lib/lookup';
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
    const details = await fetchDetails({
      source: e.external!.source,
      kind: e.kind,
      id: e.external!.id,
      season: e.series?.season,
      episode: e.series?.episode,
    });
    if (!details) continue;
    const patch: { date?: string; runtimeMin?: number } = {};
    if (details.date !== null && details.date !== e.date) patch.date = details.date;
    // backfill runtime for entries added before we started storing it
    if (e.runtimeMin === null && details.runtimeMin !== null) patch.runtimeMin = details.runtimeMin;
    if (Object.keys(patch).length === 0) continue;
    await updateEntry(e.id, patch, 'api');
    if (patch.date) moved++;
  }
  return { checked: entries.length, moved };
}

const KEY = 'slate:lastRefreshDay';

export const shouldAutoRefresh = (): boolean => localStorage.getItem(KEY) !== todayISO();

export const markRefreshed = (): void => localStorage.setItem(KEY, todayISO());
