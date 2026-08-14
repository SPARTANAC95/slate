import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import type { Entry } from '../types';
import { softDeleteEntry } from '../db';
import { KindDot } from './KindDot';
import { EntryEditor } from './EntryEditor';

export function EntryRow({ entry }: { entry: Entry }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-1">
        <EntryEditor entry={entry} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="group -mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-panel-hover">
      <KindDot kind={entry.kind} />
      <span className="min-w-0 flex-1 truncate text-13">{entry.title}</span>
      {entry.series && (
        <span className="font-mono text-11 text-text-2">
          s{entry.series.season}e{entry.series.episode}
        </span>
      )}
      {entry.annual && <span className="text-11 text-text-3">annual</span>}
      <span className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`edit ${entry.title}`}
          className="rounded p-1 text-text-3 hover:text-text"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => softDeleteEntry(entry.id)}
          aria-label={`delete ${entry.title}`}
          className="rounded p-1 text-text-3 hover:text-text"
        >
          <X size={13} />
        </button>
      </span>
    </li>
  );
}
