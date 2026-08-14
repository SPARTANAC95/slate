import type { Entry, EntryKind } from '../types';

export type TimeBudget = 'any' | 'quick' | 'evening' | 'long';

export const TIME_LABELS: Record<TimeBudget, string> = {
  any: 'any length',
  quick: '~30 min',
  evening: 'an evening',
  long: 'a weekend',
};

/** upper bound in minutes for each budget; 'long' has none */
const CEILING: Record<Exclude<TimeBudget, 'any' | 'long'>, number> = {
  quick: 45,
  evening: 240,
};

/** what we assume when a provider never told us the length */
const ASSUMED: Record<EntryKind, number> = {
  series: 45,
  film: 120,
  game: 900,
  event: 120,
  task: 30,
  note: 15,
};

/** providers report 0 for "we don't know yet", which is not a length */
export const knownRuntime = (mins: number | null | undefined): number | null =>
  typeof mins === 'number' && mins > 0 ? mins : null;

export const runtimeOf = (entry: Entry): number =>
  knownRuntime(entry.runtimeMin) ?? ASSUMED[entry.kind];

/** does this entry fit the time I have? */
export function fitsBudget(entry: Entry, budget: TimeBudget): boolean {
  if (budget === 'any') return true;
  const mins = runtimeOf(entry);
  if (budget === 'long') return mins > CEILING.evening;
  return mins <= CEILING[budget];
}

/** "45m" / "2h 10m" / "15h" — null when we have nothing real to show */
export function formatRuntime(mins: number | null): string | null {
  if (mins === null || mins <= 0) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 10) return `${h}h`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
