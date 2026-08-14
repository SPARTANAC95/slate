import { useState } from 'react';
import { ExternalLink, Pencil, X } from 'lucide-react';
import type { Entry } from '../types';
import { softDeleteEntry } from '../db';
import { KindDot } from './KindDot';
import { EntryEditor } from './EntryEditor';

const hostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

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
    <li className="group -mx-1.5 flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-panel-hover">
      <span className="mt-[7px] flex"><KindDot kind={entry.kind} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-13">{entry.title}</span>
        {entry.notes && (
          <span className="block truncate text-11 text-text-3">{entry.notes}</span>
        )}
      </span>
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
