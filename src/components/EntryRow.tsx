import { useState } from 'react';
import type { Entry } from '../types';
import { KindDot } from './KindDot';
import { Poster } from './Poster';
import { EntryEditor } from './EntryEditor';
import { EntryActions } from './EntryActions';
import { DelayHistory } from './DelayHistory';
import { DoneControls } from './DoneControls';
import { formatRuntime } from '../lib/runtime';

export function EntryRow({ entry, draggable = false }: { entry: Entry; draggable?: boolean }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-1">
        <EntryEditor entry={entry} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const runtime = formatRuntime(entry.runtimeMin);

  return (
    <li
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData('text/slate-entry', entry.id);
              e.dataTransfer.effectAllowed = 'move';
            }
          : undefined
      }
      className={`group flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-panel-hover ${
        draggable ? 'cursor-grab' : ''
      }`}
    >
      <Poster entry={entry} size="row" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <KindDot kind={entry.kind} />
          <span
            className={`min-w-0 truncate text-13 ${entry.done ? 'text-text-2 line-through' : ''}`}
          >
            {entry.title}
          </span>
          {runtime && <span className="shrink-0 font-mono text-11 text-text-3">{runtime}</span>}
        </span>
        {entry.notes && <span className="block truncate text-11 text-text-3">{entry.notes}</span>}
        {entry.tags.length > 0 && (
          <span className="flex flex-wrap gap-1 pt-0.5">
            {entry.tags.map((t) => (
              <span
                key={t}
                className="rounded-[4px] border border-line px-1 text-11 leading-4 text-text-3"
              >
                #{t}
              </span>
            ))}
          </span>
        )}
        <DelayHistory entry={entry} />
        {entry.done && <DoneControls entry={entry} />}
      </span>
      <EntryActions entry={entry} onEdit={() => setEditing(true)} />
    </li>
  );
}
