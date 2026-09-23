import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Entry } from '../types';
import { fromISODate, nextAnnualOccurrence } from './dates';
import { byTimeThenAdded } from './order';

export type RailItem = {
  entry: Entry;
  /** the date the countdown points at — annual entries use their next occurrence */
  date: string;
  /** calendar days from today; negative = past but not done */
  days: number;
};

/**
 * How a day count reads. Shared so the rail and the upcoming list can never
 * disagree about what "tomorrow" or "−3" means; each surface still styles it
 * its own way (the rail shouts it in uppercase).
 */
export function countdownLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  // a real minus sign, not a hyphen — it lines up in the mono column
  return days < 0 ? `−${-days}` : String(days);
}

/**
 * The next `limit` dated things, closest first. Past-but-not-done entries
 * go at the front — those are the ones to deal with.
 */
export function railItems(entries: Entry[], today: Date, limit = 6): RailItem[] {
  const floor = startOfDay(today);
  const items = entries
    .filter((e) => !e.done && e.deletedAt === null && typeof e.date === 'string')
    .map((e) => {
      const date = e.annual ? nextAnnualOccurrence(e.date!, floor) : e.date!;
      return { entry: e, date, days: differenceInCalendarDays(fromISODate(date), floor) };
    })
    .filter((i) => Number.isFinite(i.days));
  // same day → the earlier hour is the one coming up next
  const byDay = (a: RailItem, b: RailItem) =>
    a.days - b.days || byTimeThenAdded(a.entry, b.entry);
  const overdue = items.filter((i) => i.days < 0).sort(byDay);
  const upcoming = items.filter((i) => i.days >= 0).sort(byDay);
  return [...overdue, ...upcoming].slice(0, limit);
}

/**
 * Everything dated, in the rail's order — the rail is the first six of this.
 * One ordering function so the two surfaces always agree about what is next.
 */
export const allCountdowns = (entries: Entry[], today: Date): RailItem[] =>
  railItems(entries, today, Number.POSITIVE_INFINITY);
