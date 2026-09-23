import { useRef, useState } from 'react';
import type { Entry } from '../types';
import { updateEntry } from '../db';
import { todayISO } from '../lib/dates';

const button = 'rounded-md border border-line px-2 py-1 text-11 text-text-2 hover:bg-panel-hover hover:text-text disabled:opacity-50';

export function BacklogSchedule({ entry, onScheduled }: { entry: Entry; onScheduled?: (date: string) => void }) {
  const [choosing, setChoosing] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const schedule = async (next: string) => {
    if (!next || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await updateEntry(entry.id, { date: next });
      onScheduled?.(next);
    } catch {
      setError('Could not schedule this item. Try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return <span className="mt-2 block">
    <span className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void schedule(todayISO())} aria-label={`Schedule ${entry.title} today`} className={button}>Today</button>
      <button type="button" disabled={busy} onClick={() => setChoosing(value => !value)} aria-expanded={choosing} aria-label={`Choose date for ${entry.title}`} className={button}>Choose date</button>
    </span>
    {choosing && <span className="mt-2 flex flex-wrap items-center gap-2">
      <input type="date" aria-label={`Schedule date for ${entry.title}`} value={date} onChange={event => setDate(event.target.value)} disabled={busy}
        className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1 text-12 text-text" />
      <button type="button" disabled={busy || !date} onClick={() => void schedule(date)} className={button}>Schedule</button>
    </span>}
    {error && <span role="alert" className="mt-1 block text-11 text-amber-300">{error}</span>}
  </span>;
}
