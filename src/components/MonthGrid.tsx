import type { Entry } from '../types';
import { WEEKDAY_LABELS, monthGrid, toISODate } from '../lib/dates';
import { entriesOnDay } from '../db/hooks';
import { DayCell } from './DayCell';

type Props = {
  year: number;
  month: number;
  direction: 'next' | 'prev' | null;
  entries: Entry[];
  selected: string;
  onSelect: (iso: string) => void;
};

export function MonthGrid({ year, month, direction, entries, selected, onSelect }: Props) {
  const days = monthGrid(year, month);
  const animation =
    direction === 'next' ? 'month-enter-next' : direction === 'prev' ? 'month-enter-prev' : '';

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="section-label px-2 pb-2">
            {label}
          </div>
        ))}
      </div>
      <div
        key={`${year}-${month}`}
        className={`grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-xl border border-line bg-line ${animation}`}
      >
        {days.map((day) => {
          const iso = toISODate(day);
          return (
            <DayCell
              key={iso}
              day={day}
              iso={iso}
              inMonth={day.getMonth() === month}
              entries={entriesOnDay(entries, iso)}
              selected={iso === selected}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
