import type { LookupResult } from '../lib/lookup';
import { KindDot } from './KindDot';

type Props = {
  results: LookupResult[];
  highlight: number;
  onPick: (r: LookupResult) => void;
  onHover: (index: number) => void;
};

export function SearchDropdown({ results, highlight, onPick, onHover }: Props) {
  return (
    <div className="panel-lit fade-in absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl border border-line bg-panel p-1">
      {results.map((r, i) => (
        <button
          key={`${r.source}:${r.id}`}
          type="button"
          onClick={() => onPick(r)}
          onMouseEnter={() => onHover(i)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${
            i === highlight ? 'bg-panel-hover' : ''
          }`}
        >
          {r.posterUrl ? (
            <img
              src={r.posterUrl}
              alt=""
              className="h-10 w-7 shrink-0 rounded-[4px] object-cover"
              loading="lazy"
            />
          ) : (
            <span className="h-10 w-7 shrink-0 rounded-[4px] border border-line" />
          )}
          <span className="min-w-0 flex-1 truncate text-13">{r.title}</span>
          <span className="shrink-0 font-mono text-12 text-text-2">{r.year ?? 'tba'}</span>
          <KindDot kind={r.kind} />
        </button>
      ))}
    </div>
  );
}
