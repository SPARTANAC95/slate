import { useState } from 'react';
import type { Entry } from '../types';
import { KindDot } from './KindDot';
import { Poster } from './Poster';
import { EntryEditor } from './EntryEditor';
import { EntryActions } from './EntryActions';
import { EntryMeta } from './EntryMeta';
import { DelayHistory } from './DelayHistory';
import { DoneControls } from './DoneControls';
import { BacklogSchedule } from './BacklogSchedule';

/**
 * Every row can be dragged onto a day cell — a backlog item to schedule it, a
 * dated one to move it. Backlog rows also provide explicit schedule actions.
 * The grab cursor is reserved for undated rows.
 */
export function EntryRow({ entry, draggable = true, onScheduled }: { entry: Entry; draggable?: boolean; onScheduled?: (date: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const grab = draggable && entry.date === null;

  if (editing) {
    return (
      <li className="py-1">
        <EntryEditor entry={entry} onDone={() => setEditing(false)} onSaved={date => { if (date && entry.date === null) onScheduled?.(date); }} />
      </li>
    );
  }

  return (
    <li
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              // selecting text in the verdict box must not pick the whole row
              // up instead; the title stays a drag handle, buttons click as ever
              if ((e.target as HTMLElement).closest('input, textarea')) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.setData('text/slate-entry', entry.id);
              e.dataTransfer.effectAllowed = 'move';
            }
          : undefined
      }
      className={`group flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-panel-hover ${
        grab ? 'cursor-grab' : ''
      }`}
    >
      <Poster entry={entry} size="row" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <KindDot kind={entry.kind} />
          {entry.time && (
            <span className="shrink-0 font-mono text-12 tabular-nums text-text-2">
              {entry.time}
            </span>
          )}
          {/* the title is the way into the editor — nothing else to discover */}
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="edit"
            className={`min-w-0 flex-1 truncate text-left text-13 transition-colors duration-150 ${
              entry.done ? 'text-text-2 line-through' : 'hover:text-white'
            }`}
          >
            {entry.title}
          </button>
          {entry.date !== null && <EntryActions entry={entry} onEdit={() => setEditing(true)} onError={setError} />}
        </span>
        {entry.notes && <span className="block truncate text-11 text-text-3">{entry.notes}</span>}
        <EntryMeta entry={entry} />
        <DelayHistory entry={entry} />
        {entry.date === null && <span className="mt-2 block"><EntryActions entry={entry} onEdit={() => setEditing(true)} onError={setError} /></span>}
        {entry.date === null && !entry.done && <BacklogSchedule entry={entry} onScheduled={onScheduled} />}
        {error && <span role="alert" className="mt-1 block text-11 text-amber-300">{error}</span>}
        {entry.done && <DoneControls entry={entry} />}
      </span>
    </li>
  );
}
