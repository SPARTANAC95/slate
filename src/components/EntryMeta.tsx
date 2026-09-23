import type { Entry } from '../types';
import { formatRuntime } from '../lib/runtime';

const MOVED_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const recentlyMovedByApi = (entry: Entry): boolean => {
  const last = entry.dateHistory[entry.dateHistory.length - 1];
  return last?.source === 'api' && Date.now() - last.changedAt < MOVED_WINDOW_MS;
};

const chip = 'rounded-[5px] border border-line px-1 leading-4';

/**
 * The quiet second line of a row: everything you read rather than click.
 * It lives below the title so a long title never has to fight a badge for
 * the same 300px.
 */
export function EntryMeta({ entry }: { entry: Entry }) {
  const runtime = formatRuntime(entry.runtimeMin);
  const moved = recentlyMovedByApi(entry);
  const pinned = entry.datePinned && entry.external !== null && entry.date !== null;
  if (!runtime && !entry.series && !entry.annual && !moved && !pinned && entry.tags.length === 0) {
    return null;
  }

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-0.5 text-11 leading-4 text-text-3">
      {entry.series && (
        <span className="font-mono">
          s{entry.series.season}e{entry.series.episode}
        </span>
      )}
      {runtime && <span className="font-mono">{runtime}</span>}
      {entry.annual && <span>annual</span>}
      {moved && <span className={`${chip} text-text-2`}>moved</span>}
      {pinned && (
        <span className={chip} title="my date — release updates will not move it">
          my date
        </span>
      )}
      {entry.tags.map((t) => (
        <span key={t} className={chip}>
          #{t}
        </span>
      ))}
    </span>
  );
}
