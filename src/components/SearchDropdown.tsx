import type { ReactNode } from 'react';
import { Image } from 'lucide-react';
import type { LookupResult } from '../lib/lookup';
import { CoverArt } from './CoverArt';
import { KindDot } from './KindDot';

/** the poster slot keeps its footprint whether or not there is art in it */
const SLOT = 'h-[54px] w-9 shrink-0 rounded-[5px] border border-line';

type Props = {
  results: LookupResult[];
  highlight: number;
  onPick: (r: LookupResult) => void;
  /**
   * Take the poster and leave the title and date alone. Omitted in the entry
   * editor, which has `ArtPicker` a few rows below for exactly that.
   */
  onPickArt?: (r: LookupResult) => void;
  onHover: (index: number) => void;
  /** footer copy — the keys mean different things per call site */
  hint?: ReactNode;
};

export function SearchDropdown({ results, highlight, onPick, onPickArt, onHover, hint }: Props) {
  return (
    <div className="panel-lit fade-in absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl border border-line bg-panel p-1">
      {results.map((r, i) => (
        <div
          key={`${r.source}:${r.id}`}
          onMouseEnter={() => onHover(i)}
          className={`flex items-center rounded-lg ${i === highlight ? 'bg-panel-hover' : ''}`}
        >
          <button
            type="button"
            // alt is the keyboard's art-only chord — hold it here too
            onClick={(e) => (e.altKey && onPickArt ? onPickArt(r) : onPick(r))}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left"
          >
            <CoverArt
              url={r.posterUrl}
              className={`${SLOT} object-cover`}
              fallback={<span className={SLOT} />}
            />
            <span className="min-w-0 flex-1 truncate text-13">{r.title}</span>
            <span className="shrink-0 font-mono text-12 text-text-2">{r.year ?? 'tba'}</span>
            <KindDot kind={r.kind} />
          </button>
          {onPickArt && (
            <button
              type="button"
              onClick={() => onPickArt(r)}
              aria-label={`use only the cover art of ${r.title}`}
              title="cover art only — keep my title and date"
              className="mr-1 shrink-0 rounded-lg p-1.5 text-text-3 transition-colors duration-150 hover:bg-panel hover:text-text"
            >
              <Image size={14} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 px-2 pb-1 pt-1.5 font-mono text-11 text-text-3">
        {hint ?? (
          <>
            <span>enter · add with its date</span>
            <span>alt enter · cover art only</span>
          </>
        )}
      </div>
    </div>
  );
}
