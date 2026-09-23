import { db, updateEntry } from './index';
import { LIVE_SOURCES, type Entry } from '../types';
import { fetchDetails } from '../lib/lookup';
import { todayISO } from '../lib/dates';

/**
 * How many entries are asked about at once. One at a time, an unplugged
 * network costs every entry its full timeout in a row — thirty entries left
 * the header saying "checking…" for minutes. Four keeps well inside every
 * provider's rate limit.
 */
const CONCURRENCY = 4;

/**
 * What a refresh should do with one entry's date.
 *  - 'move' the provider announced a different date and I never claimed this one
 *  - 'keep' it moved, but the date on the calendar is mine
 *  - 'none' nothing to do: same date, or the provider has none (TBA)
 * A provider with no date NEVER clears one that is already there.
 */
export function dateVerdict(
  entry: { date: string | null; datePinned: boolean },
  providerDate: string | null,
): 'move' | 'keep' | 'none' {
  if (providerDate === null || providerDate === entry.date) return 'none';
  return entry.datePinned ? 'keep' : 'move';
}

/**
 * Re-check every non-done entry that came from an API. A moved date is
 * written through updateEntry, so it lands in dateHistory as source 'api'.
 * A provider returning no date (TBA) never clears an existing one, and a
 * date I pinned is never touched — that one is mine, not the studio's.
 */
export async function refreshExternalDates(): Promise<{
  /** how many were asked about */
  checked: number;
  /** how many the providers actually answered for — 0 with checked > 0 means offline */
  answered: number;
  moved: number;
  kept: number;
}> {
  const live: readonly string[] = LIVE_SOURCES;
  const entries = await db.entries
    .filter(
      (e) =>
        e.deletedAt === null &&
        !e.done &&
        e.external !== null &&
        // a retired provider has nothing to say; asking would only pad the count
        live.includes(e.external.source),
    )
    .toArray();
  let answered = 0;
  let moved = 0;
  let kept = 0;

  const check = async (e: Entry) => {
    const details = await fetchDetails({
      source: e.external!.source,
      kind: e.kind,
      id: e.external!.id,
      season: e.series?.season,
      episode: e.series?.episode,
    });
    if (!details) return;
    answered++;
    const patch: { date?: string; runtimeMin?: number } = {};
    const verdict = dateVerdict(e, details.date);
    // the release slipped, but I set this date on purpose — leave it standing
    if (verdict === 'keep') kept++;
    if (verdict === 'move') patch.date = details.date!;
    // backfill runtime for entries added before we started storing it
    if (e.runtimeMin === null && details.runtimeMin !== null) patch.runtimeMin = details.runtimeMin;
    if (Object.keys(patch).length === 0) return;
    await updateEntry(e.id, patch, 'api');
    if (patch.date) moved++;
  };

  // a few workers draining one queue — js is single-threaded, so shift() is safe
  const queue = [...entries];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let e = queue.shift(); e !== undefined; e = queue.shift()) await check(e);
    }),
  );
  return { checked: entries.length, answered, moved, kept };
}

const KEY = 'slate:lastRefreshDay';

export const shouldAutoRefresh = (): boolean => localStorage.getItem(KEY) !== todayISO();

export const markRefreshed = (): void => localStorage.setItem(KEY, todayISO());
