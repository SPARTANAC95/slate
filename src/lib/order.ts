import type { Entry } from '../types';

/**
 * How one day reads top to bottom: timed things in clock order first, then
 * whatever has no hour, oldest first. Shared by the day panel, the month
 * cells and the countdown rail so a day looks the same everywhere.
 */
export const byTimeThenAdded = (a: Entry, b: Entry): number => {
  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time.localeCompare(b.time);
  }
  return a.createdAt - b.createdAt;
};
