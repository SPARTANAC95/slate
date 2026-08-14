import type { Entry } from '../types';
import { railItems } from '../lib/rail';
import { KindDot } from './KindDot';

type Props = {
  entries: Entry[];
  onJump: (date: string) => void;
};

function Count({ days }: { days: number }) {
  if (days === 0 || days === 1) {
    return (
      <span className="font-mono text-18 uppercase tracking-[-0.01em] text-text">
        {days === 0 ? 'today' : 'tomorrow'}
      </span>
    );
  }
  return (
    <span className="font-mono text-32 leading-none tracking-[-0.02em] text-text">
      {days < 0 ? `−${-days}` : days}
    </span>
  );
}

export function CountdownRail({ entries, onJump }: Props) {
  const items = railItems(entries, new Date());
  if (items.length === 0) return null;

  return (
    <div className="mb-3 flex gap-2">
      {items.map(({ entry, date, days }) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onJump(date)}
          title={entry.title}
          className={`flex min-w-0 flex-1 basis-0 flex-col items-start gap-1.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors duration-150 ${
            days < 0
              ? 'border-line-strong bg-panel-hover hover:bg-panel'
              : 'border-line bg-transparent hover:bg-panel'
          }`}
        >
          <span className="flex h-8 items-end">
            <Count days={days} />
          </span>
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <KindDot kind={entry.kind} />
            <span className="truncate text-12 text-text-2">{entry.title}</span>
            {entry.series && (
              <span className="shrink-0 font-mono text-11 text-text-3">
                s{entry.series.season}e{entry.series.episode}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
