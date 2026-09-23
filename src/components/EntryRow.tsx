import { useState } from 'react';
import type { Entry } from '../types';
import { KindDot } from './KindDot';
import { Poster } from './Poster';
import { EntryEditor } from './EntryEditor';
import { EntryActions } from './EntryActions';
import { EntryMeta } from './EntryMeta';
import { DelayHistory } from './DelayHistory';
import { DoneControls } from './DoneControls';

/**
 * Every row can be dragged onto a day cell — a backlog item to schedule it, a
 * dated one to move it. The grab cursor is reserved for the backlog, where
 * dragging is the main way out; on a day the title is a button and the row
 * should not look like a handle.
 */
export function EntryRow({ entry, draggable = true }: { entry: Entry; draggable?: boolean }) {
  const [editing, setEditing] = useState(false);
  const grab = draggable && entry.date === null;

  if (editing) {
    return (
      <li className="py-1">
        <EntryEditor entry={entry} onDone={() => setEditing(false)} />
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
          <EntryActions entry={entry} onEdit={() => setEditing(true)} />
        </span>
        {entry.notes && <span className="block truncate text-11 text-text-3">{entry.notes}</span>}
        <EntryMeta entry={entry} />
        <DelayHistory entry={entry} />
        {entry.done && <DoneControls entry={entry} />}
      </span>
    </li>
  );
}
