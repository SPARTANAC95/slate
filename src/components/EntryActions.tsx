import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import type { Entry } from '../types';
import { softDeleteEntry, updateEntry } from '../db';
import { todayISO } from '../lib/dates';

const hostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** the things you can *do* to a row — everything readable lives in EntryMeta */
export function EntryActions({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const markable = !entry.done && !entry.annual && entry.date !== null && entry.date <= todayISO();

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {markable && (
        <button
          type="button"
          onClick={() => updateEntry(entry.id, { done: true })}
          aria-label={`mark ${entry.title} done`}
          title="mark done"
          className="rounded-lg border border-line px-1.5 py-0.5 text-11 leading-4 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
        >
          done
        </button>
      )}
      {entry.done && (
        <button
          type="button"
          onClick={() => updateEntry(entry.id, { done: false })}
          aria-label={`mark ${entry.title} not done`}
          title="mark not done"
          className="rounded p-1 text-text-2 hover:text-text"
        >
          <Check size={13} />
        </button>
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
      <span className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`edit ${entry.title}`}
          title="edit"
          className="rounded p-1 text-text-3 hover:text-text"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => softDeleteEntry(entry.id)}
          aria-label={`delete ${entry.title}`}
          title="delete"
          className="rounded p-1 text-text-3 hover:text-text"
        >
          <X size={13} />
        </button>
      </span>
    </span>
  );
}
