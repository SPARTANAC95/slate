import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import { useRef, useState } from 'react';
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
export function EntryActions({ entry, onEdit, onError }: { entry: Entry; onEdit: () => void; onError: (message: string) => void }) {
  const undated = entry.date === null;
  const markable = !entry.done && (undated || (!entry.annual && entry.date !== null && entry.date <= todayISO()));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    onError('');
    try { await work(); } catch { onError('Could not save that change. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  };

  return (
    <span className={`flex shrink-0 items-center gap-0.5 ${undated ? 'flex-wrap' : ''}`}>
      {markable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => updateEntry(entry.id, { done: true }))}
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
          disabled={busy}
          onClick={() => void run(() => updateEntry(entry.id, { done: false }))}
          aria-label={`mark ${entry.title} not done`}
          title="mark not done"
          className="rounded p-1 text-text-2 hover:text-text"
        >
          {undated ? 'Undo' : <Check size={13} />}
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
      <span className={`flex gap-0.5 ${undated ? '' : 'opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100'}`}>
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          aria-label={`edit ${entry.title}`}
          title="edit"
          className={`rounded p-1 hover:text-text ${undated ? 'text-text-2' : 'text-text-3'}`}
        >
          {undated ? <span className="text-11">Edit</span> : <Pencil size={13} />}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => softDeleteEntry(entry.id))}
          aria-label={`delete ${entry.title}`}
          title="delete"
          className={`rounded p-1 hover:text-text ${undated ? 'text-text-2' : 'text-text-3'}`}
        >
          {undated ? <span className="text-11">Delete</span> : <X size={13} />}
        </button>
      </span>
    </span>
  );
}
