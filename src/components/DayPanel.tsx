import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Entry } from '../types';
import { entriesOnDay } from '../db/hooks';
import { dayHeading, todayISO } from '../lib/dates';
import { EntryRow } from './EntryRow';
import { EntryEditor } from './EntryEditor';
import { DayNoteBox } from './DayNoteBox';

type Props = {
  date: string;
  entries: Entry[];
};

export function DayPanel({ date, entries }: Props) {
  const [adding, setAdding] = useState(false);
  const dayEntries = entriesOnDay(entries, date);
  const { weekday, date: dateLabel } = dayHeading(date);
  const isToday = date === todayISO();

  return (
    <aside className="panel-lit flex w-[320px] shrink-0 flex-col self-start rounded-xl border border-line bg-panel p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-14 font-medium tracking-[-0.02em]">
          {isToday ? 'today' : weekday}
        </h2>
        <span className="font-mono text-12 text-text-2">{dateLabel}</span>
      </header>

      <div className="mt-4">
        <div className="section-label mb-2">entries</div>
        {dayEntries.length === 0 && !adding && (
          <p className="py-1 text-12 text-text-3">nothing planned</p>
        )}
        <ul className="flex flex-col">
          {dayEntries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </ul>

        {adding ? (
          <div className="mt-2">
            <EntryEditor date={date} onDone={() => setAdding(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-12 text-text-3 transition-colors duration-150 hover:bg-panel-hover hover:text-text-2"
          >
            <Plus size={13} />
            add entry
          </button>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="section-label mb-2">day note</div>
        <DayNoteBox date={date} />
      </div>
    </aside>
  );
}
