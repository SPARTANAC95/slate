import { useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import type { Entry, EntryKind } from '../types';
import { KIND_ORDER } from '../types';
import { updateEntry } from '../db';
import { todayISO } from '../lib/dates';
import { addDays } from 'date-fns';
import { fromISODate, toISODate } from '../lib/dates';
import { EntryRow } from './EntryRow';

type TimeFilter = 'any' | '30min' | 'evening' | 'weekend';

const TIME_KINDS: Record<TimeFilter, EntryKind[]> = {
  any: KIND_ORDER,
  '30min': ['series', 'task', 'note'],
  evening: ['film', 'series'],
  weekend: ['game'],
};

const field =
  'rounded-lg border border-line bg-panel px-2 py-1 text-12 text-text-2 ' +
  'transition-colors duration-150 focus:border-line-strong focus:outline-none';

export function Backlog({ entries }: { entries: Entry[] }) {
  const backlog = useMemo(
    () => entries.filter((e) => e.date === null).sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );
  const [kind, setKind] = useState<'any' | EntryKind>('any');
  const [time, setTime] = useState<TimeFilter>('any');
  const [picked, setPicked] = useState<Entry | null>(null);

  const candidates = backlog.filter(
    (e) => (kind === 'any' || e.kind === kind) && TIME_KINDS[time].includes(e.kind),
  );

  const roll = () => {
    if (candidates.length === 0) return setPicked(null);
    const pool = candidates.length > 1 && picked
      ? candidates.filter((e) => e.id !== picked.id)
      : candidates;
    setPicked(pool[Math.floor(Math.random() * pool.length)]);
  };

  const schedule = (id: string, date: string) => {
    updateEntry(id, { date });
    setPicked(null);
  };

  const current = picked && candidates.some((e) => e.id === picked.id) ? picked : null;

  return (
    <aside className="panel-lit flex h-full w-[280px] shrink-0 flex-col rounded-xl border border-line bg-panel p-4">
      <div className="section-label mb-2">pick for me</div>
      <div className="flex gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as never)} aria-label="kind filter" className={`${field} flex-1`}>
          <option value="any">any kind</option>
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <select value={time} onChange={(e) => setTime(e.target.value as TimeFilter)} aria-label="time filter" className={`${field} flex-1`}>
          <option value="any">any time</option>
          <option value="30min">~30min</option>
          <option value="evening">an evening</option>
          <option value="weekend">a weekend</option>
        </select>
      </div>
      <button
        type="button"
        onClick={roll}
        disabled={candidates.length === 0}
        className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-panel-hover px-3 py-1.5 text-12 text-text transition-colors duration-150 hover:bg-panel disabled:opacity-50"
      >
        <Dices size={13} />
        {current ? 'Re-roll' : 'Pick for me'}
      </button>
      {current && (
        <div key={current.id} className="fade-in mt-2 rounded-lg border border-line p-2.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-13">{current.title}</span>
          </div>
          {current.notes && <div className="mt-0.5 truncate text-11 text-text-3">{current.notes}</div>}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => schedule(current.id, todayISO())} className="rounded-lg border border-line px-2 py-0.5 text-11 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text">
              Schedule today
            </button>
            <button type="button" onClick={() => schedule(current.id, toISODate(addDays(fromISODate(todayISO()), 1)))} className="rounded-lg border border-line px-2 py-0.5 text-11 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text">
              tomorrow
            </button>
          </div>
        </div>
      )}
      {candidates.length === 0 && backlog.length > 0 && (
        <p className="mt-2 text-11 text-text-3">nothing in the backlog fits these filters</p>
      )}

      <div className="section-label mb-2 mt-5 border-t border-line pt-4">
        backlog <span className="font-mono">{backlog.length}</span>
      </div>
      {backlog.length === 0 && (
        <p className="text-12 text-text-3">empty — add an entry without a date and it lands here</p>
      )}
      <ul className="-mx-1.5 flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5">
        {backlog.map((e) => (
          <EntryRow key={e.id} entry={e} draggable />
        ))}
      </ul>
      {backlog.length > 0 && (
        <p className="mt-2 text-11 text-text-3">drag onto a day to schedule</p>
      )}
    </aside>
  );
}
