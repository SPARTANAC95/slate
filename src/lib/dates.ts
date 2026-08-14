import {
  addDays,
  format,
  getDate,
  getMonth,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export const toISODate = (d: Date): string => format(d, 'yyyy-MM-dd');

export const fromISODate = (iso: string): Date => parseISO(iso);

export const todayISO = (): string => toISODate(new Date());

/**
 * 42 cells (6 fixed weeks) covering the given month, Monday-first.
 * Fixed height keeps the grid from jumping between months.
 */
export function monthGrid(year: number, monthIndex: number): Date[] {
  const first = startOfMonth(new Date(year, monthIndex, 1));
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/**
 * Does an entry with this date/annual flag occur on the given day?
 * Annual entries repeat on the same month/day every year.
 */
export function occursOn(
  entryDate: string | null,
  annual: boolean,
  dayISO: string,
): boolean {
  if (entryDate === null) return false;
  if (entryDate === dayISO) return true;
  if (!annual) return false;
  const e = fromISODate(entryDate);
  const d = fromISODate(dayISO);
  return getMonth(e) === getMonth(d) && getDate(e) === getDate(d);
}

export const isToday = (d: Date): boolean => isSameDay(d, new Date());

export const WEEKDAY_LABELS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const monthName = (monthIndex: number): string =>
  format(new Date(2000, monthIndex, 1), 'MMMM');

/** e.g. "thursday · 14.08." for the day panel heading */
export const dayHeading = (iso: string): { weekday: string; date: string } => {
  const d = fromISODate(iso);
  return { weekday: format(d, 'EEEE').toLowerCase(), date: format(d, 'dd.MM.') };
};
