import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import type { Entry } from '../types';
import { softDeleteEntry, updateEntry } from '../db';
import { todayISO } from '../lib/dates';

const MOVED_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const recentlyMovedByApi = (entry: Entry): boolean => {
  const last = entry.dateHistory[entry.dateHistory.length - 1];
  return last?.source === 'api' && Date.now() - last.changedAt < MOVED_WINDOW_MS;
};

const hostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** everything on the right-hand side of an entry row */
export function EntryActions({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const markable = !entry.done && !entry.annual && entry.date !== null && entry.date <= todayISO();

  return (
    <>
      {markable && (
        <button
          type="button"
          onClick={() => updateEntry(entry.id, { done: true })}
          className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-11 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
        >
          Mark done
        </button>
      )}
      {entry.done && (
        <button
          type="button"
          onClick={() => updateEntry(entry.id, { done: false })}
          aria-label={`mark ${entry.title} not done`}
          title="mark not done"
          className="shrink-0 rounded p-1 text-text-2 hover:text-text"
        >
          <Check size={13} />
        </button>
      )}
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
          className="shrink-0 rounded p-1 text-text-3 transition-colors duration-150 hover:text-text"
        >
          <ExternalLink size={13} />
        </a>
      ))}
      {entry.series && (
        <span className="shrink-0 font-mono text-11 text-text-2">
          s{entry.series.season}e{entry.series.episode}
        </span>
      )}
      {entry.annual && <span className="shrink-0 text-11 text-text-3">annual</span>}
      <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
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
    </>
  );
}
