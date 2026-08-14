import { useMemo } from 'react';
import type { Entry } from '../types';
import { EntryRow } from './EntryRow';
import { PickForMe } from './PickForMe';

export function Backlog({ entries }: { entries: Entry[] }) {
  const backlog = useMemo(
    () => entries.filter((e) => e.date === null).sort((a, b) => b.createdAt - a.createdAt),
    [entries],
  );

  return (
    <aside className="panel-lit flex h-full w-[300px] shrink-0 flex-col rounded-xl border border-line bg-panel p-4">
      <PickForMe backlog={backlog} />

      <div className="section-label mb-2 mt-5 border-t border-line pt-4">
        backlog <span className="font-mono">{backlog.length}</span>
      </div>
      {backlog.length === 0 && (
        <p className="text-12 text-text-3">
          empty — add an entry without a date and it lands here
        </p>
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
