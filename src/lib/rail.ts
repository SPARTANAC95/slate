import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Entry } from '../types';
import { fromISODate, nextAnnualOccurrence } from './dates';

export type RailItem = {
  entry: Entry;
  /** the date the countdown points at — annual entries use their next occurrence */
  date: string;
  /** calendar days from today; negative = past but not done */
  days: number;
};

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
  const overdue = items.filter((i) => i.days < 0).sort((a, b) => a.days - b.days);
  const upcoming = items.filter((i) => i.days >= 0).sort((a, b) => a.days - b.days);
  return [...overdue, ...upcoming].slice(0, limit);
}
