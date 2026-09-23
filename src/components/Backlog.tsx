import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Entry } from '../types';
import { EntryRow } from './EntryRow';
import { PickForMe } from './PickForMe';
import { EntryEditor } from './EntryEditor';

export function Backlog({ entries, onClose, onScheduled }: {
  entries: Entry[];
  onClose: () => void;
  onScheduled: (date: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const backlog = useMemo(
    () => entries.filter((e) => e.date === null && e.deletedAt === null).sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );
  const waiting = backlog.filter(entry => !entry.done);
  const completed = backlog.filter(entry => entry.done);

  return (
    <aside aria-label="Backlog" className="panel-lit flex h-full w-[320px] shrink-0 flex-col rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-14 font-medium">Backlog <span className="font-mono text-12 text-text-3">{waiting.length}</span></h2>
        <button type="button" onClick={onClose} aria-label="Close backlog" className="rounded p-1 text-text-2 hover:bg-panel-hover"><X size={16} /></button>
      </div>
      <p className="mb-3 mt-1 text-12 text-text-3">Saved for later. Pick a day whenever you’re ready.</p>
      {!adding && <button type="button" onClick={() => setAdding(true)} className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-panel-hover px-3 py-2 text-12 text-text hover:bg-panel">
        <Plus size={14} /> Add to backlog
      </button>}
      <div className="-mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5">
        {adding && <div className="mb-3"><EntryEditor onDone={() => setAdding(false)} onSaved={date => { if (date) onScheduled(date); }} /></div>}
        {waiting.length === 0 && <p className="py-3 text-12 text-text-3">Nothing waiting. Add an idea above, then schedule it, mark it done, or remove it.</p>}
        <ul className="flex flex-col gap-2">
          {waiting.map(entry => <EntryRow key={entry.id} entry={entry} onScheduled={onScheduled} />)}
        </ul>
        {waiting.length > 0 && <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-12 text-text-2">Help me choose</summary>
          <div className="mt-3 flex flex-col"><PickForMe backlog={waiting} onScheduled={onScheduled} /></div>
        </details>}
        {completed.length > 0 && <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-12 text-text-3">Completed ({completed.length})</summary>
          <ul className="mt-2">{completed.map(entry => <EntryRow key={entry.id} entry={entry} />)}</ul>
        </details>}
      </div>
      {waiting.length > 0 && <p className="mt-3 text-11 text-text-3">Use Today or Choose date. You can also drag onto the calendar.</p>}
    </aside>
  );
}
