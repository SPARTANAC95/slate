import { format } from 'date-fns';
import type { Entry } from '../types';
import { fromISODate } from '../lib/dates';
import { allCountdowns, countdownLabel, type RailItem } from '../lib/rail';
import { formatRuntime } from '../lib/runtime';
import { KindDot } from './KindDot';
import { EntryRow } from './EntryRow';

type Props = {
  entries: Entry[];
  onJumpToDay: (iso: string) => void;
};

const ROW =
  'group flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left ' +
  'transition-colors duration-150 hover:bg-panel-hover';

/** the count column is fixed width so every number lines up down the page */
const COUNT = 'w-[72px] shrink-0 text-right font-mono text-13 tabular-nums';

function Trailing({ entry }: { entry: Entry }) {
  const runtime = formatRuntime(entry.runtimeMin);
  return (
    <>
      {entry.series && (
        <span className="shrink-0 font-mono text-11 text-text-3">
          s{entry.series.season}e{entry.series.episode}
        </span>
      )}
      {runtime && <span className="shrink-0 font-mono text-11 text-text-3">{runtime}</span>}
    </>
  );
}

function CountdownRow({ item, onJump }: { item: RailItem; onJump: (iso: string) => void }) {
  const { entry, date, days } = item;
  const overdue = days < 0;
  return (
    <button type="button" onClick={() => onJump(date)} className={ROW}>
      <span className={`${COUNT} ${overdue ? 'text-kind-film' : 'text-text'}`}>
        {countdownLabel(days)}
      </span>
      <KindDot kind={entry.kind} />
      <span className="min-w-0 flex-1 truncate text-13 text-text">{entry.title}</span>
      <Trailing entry={entry} />
      {entry.time && (
        <span className="shrink-0 font-mono text-11 tabular-nums text-text-2">{entry.time}</span>
      )}
      <span className="w-[80px] shrink-0 text-right font-mono text-11 tabular-nums text-text-3">
        {format(fromISODate(date), 'dd.MM.yyyy')}
      </span>
    </button>
  );
}

/**
 * Every tracked thing with its countdown, soonest first — the rail is the
 * first six of this list, in the same order. Overdue sits at the top with a
 * negative count, and the undated tail is here too so this really is
 * everything rather than everything-with-a-date.
 */
export function UpcomingView({ entries, onJumpToDay }: Props) {
  const dated = allCountdowns(entries, new Date());
  const undated = entries
    .filter((e) => !e.done && e.deletedAt === null && e.date === null)
    .sort((a, b) => b.createdAt - a.createdAt);
  const total = dated.length + undated.length;

  return (
    <div className="fade-in flex min-h-0 min-w-0 flex-1 flex-col">
      <p className="mb-3 text-center font-mono text-12 text-text-3">
        {total === 0 ? 'nothing tracked yet' : `${total} tracked`}
        {undated.length > 0 && ` · ${undated.length} without a date`}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] pb-4">
          {dated.map((item) => (
            <CountdownRow key={item.entry.id} item={item} onJump={onJumpToDay} />
          ))}

          {undated.length > 0 && (
            <>
              <div className="section-label mb-1 mt-4 border-t border-line pt-3">
                no date yet
              </div>
              <ul>{undated.map(entry => <EntryRow key={entry.id} entry={entry} draggable={false} onScheduled={onJumpToDay} />)}</ul>
            </>
          )}

          {total === 0 && (
            <p className="px-2 py-6 text-center text-12 text-text-3">
              add something with a date and its countdown shows up here
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
