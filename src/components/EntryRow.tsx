import { useState } from 'react';
import { ExternalLink, Pencil, X } from 'lucide-react';
import type { Entry } from '../types';
import { softDeleteEntry } from '../db';
import { KindDot } from './KindDot';
import { EntryEditor } from './EntryEditor';
import { DelayHistory } from './DelayHistory';

const MOVED_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const recentlyMovedByApi = (entry: Entry) => {
  const last = entry.dateHistory[entry.dateHistory.length - 1];
  return last?.source === 'api' && Date.now() - last.changedAt < MOVED_WINDOW_MS;
};

const hostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function EntryRow({ entry, draggable = false }: { entry: Entry; draggable?: boolean }) {
  const [editing, setEditing] = useState(false);

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
              e.dataTransfer.setData('text/slate-entry', entry.id);
              e.dataTransfer.effectAllowed = 'move';
            }
          : undefined
      }
      className={`group flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-panel-hover ${
        draggable ? 'cursor-grab' : ''
      }`}
    >
      <span className="mt-[7px] flex"><KindDot kind={entry.kind} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-13">{entry.title}</span>
        {entry.notes && (
          <span className="block truncate text-11 text-text-3">{entry.notes}</span>
        )}
        <DelayHistory entry={entry} />
      </span>
      {recentlyMovedByApi(entry) && (
        <span className="shrink-0 rounded-[5px] border border-line px-1 text-11 leading-4 text-text-2">
          moved
        </span>
      )}
      {entry.links.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`open ${hostname(url)}`}
          title={url}
          className="rounded p-1 text-text-3 transition-colors duration-150 hover:text-text"
        >
          <ExternalLink size={13} />
        </a>
      ))}
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
