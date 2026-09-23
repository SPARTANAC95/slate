import { differenceInCalendarDays, format } from 'date-fns';
import type { Entry } from '../types';
import { fromISODate } from '../lib/dates';

/**
 * The delay trail: original date struck through, every later date after
 * it, and a plain count. Visible in the row itself — that's the point.
 */
export function DelayHistory({ entry }: { entry: Entry }) {
  const dated = entry.dateHistory.filter((h) => h.date !== null);
  if (dated.length < 2) return null;

  const fmt = (iso: string) => format(fromISODate(iso), 'dd.MM.yy');
  const first = dated[0].date!;
  const last = dated[dated.length - 1].date!;
  const days = differenceInCalendarDays(fromISODate(last), fromISODate(first));
  const times = dated.length - 1;

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 font-mono text-11 leading-4">
      <span className="text-text-3 line-through">{fmt(first)}</span>
      {dated.slice(1).map((h, i) => (
        <span
          // two writes inside one millisecond share a changedAt, so the index
          // has to come along or react sees duplicate keys
          key={`${h.changedAt}:${i}`}
          className={i === dated.length - 2 ? 'text-text-2' : 'text-text-3 line-through'}
        >
          → {fmt(h.date!)}
        </span>
      ))}
      <span className="text-text-3">
        · {days >= 0 ? `delayed ${times}×, ${days} days total` : `moved ${times}×, ${-days} days earlier`}
      </span>
    </span>
  );
}
