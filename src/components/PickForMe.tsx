import { useState } from 'react';
import { Dices } from 'lucide-react';
import { addDays } from 'date-fns';
import type { Entry, EntryKind } from '../types';
import { KIND_ORDER } from '../types';
import { updateEntry } from '../db';
import { fromISODate, toISODate, todayISO } from '../lib/dates';
import {
  fitsBudget,
  formatRuntime,
  knownRuntime,
  runtimeOf,
  TIME_LABELS,
  type TimeBudget,
} from '../lib/runtime';
import { KindDot } from './KindDot';

const field =
  'rounded-lg border border-line bg-panel px-2 py-1 text-12 text-text-2 ' +
  'transition-colors duration-150 focus:border-line-strong focus:outline-none';

const chip =
  'rounded-lg border border-line px-2 py-0.5 text-11 text-text-2 ' +
  'transition-colors duration-150 hover:bg-panel-hover hover:text-text';

/** a dice roll over the backlog for when deciding is the hard part */
export function PickForMe({ backlog }: { backlog: Entry[] }) {
  const [kind, setKind] = useState<'any' | EntryKind>('any');
  const [budget, setBudget] = useState<TimeBudget>('any');
  // hold the id, not the row — the rendered copy must follow later edits
  const [pickedId, setPickedId] = useState<string | null>(null);

  const candidates = backlog.filter(
    (e) => (kind === 'any' || e.kind === kind) && fitsBudget(e, budget),
  );

  const roll = () => {
    if (candidates.length === 0) return setPickedId(null);
    const pool =
      candidates.length > 1 && pickedId ? candidates.filter((e) => e.id !== pickedId) : candidates;
    setPickedId(pool[Math.floor(Math.random() * pool.length)].id);
  };

  // clear the pick only once the write is really in — dropping it first would
  // leave a failed schedule looking exactly like a successful one
  const schedule = async (id: string, date: string) => {
    await updateEntry(id, { date });
    setPickedId(null);
  };

  const current = candidates.find((e) => e.id === pickedId) ?? null;

  return (
    <>
      <div className="section-label mb-2">pick for me</div>
      <div className="flex gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as 'any' | EntryKind)}
          aria-label="kind filter"
          className={`${field} flex-1`}
        >
          <option value="any">any kind</option>
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={budget}
          onChange={(e) => setBudget(e.target.value as TimeBudget)}
          aria-label="time filter"
          className={`${field} flex-1`}
        >
          {(Object.keys(TIME_LABELS) as TimeBudget[]).map((b) => (
            <option key={b} value={b}>
              {TIME_LABELS[b]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={roll}
        disabled={candidates.length === 0}
        className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-panel-hover px-3 py-1.5 text-12 text-text transition-colors duration-150 hover:bg-panel disabled:opacity-50"
      >
        <Dices size={13} />
        {current ? 'Re-roll' : 'Pick for me'}
      </button>

      {current && (
        <div key={current.id} className="fade-in mt-2 rounded-lg border border-line p-2.5">
          <div className="flex items-center gap-1.5">
            <KindDot kind={current.kind} />
            <span className="min-w-0 flex-1 truncate text-13">{current.title}</span>
            <span className="shrink-0 font-mono text-11 text-text-3">
              {knownRuntime(current.runtimeMin)
                ? formatRuntime(current.runtimeMin)
                : `~${formatRuntime(runtimeOf(current))}`}
            </span>
          </div>
          {current.notes && (
            <div className="mt-0.5 truncate text-11 text-text-3">{current.notes}</div>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => schedule(current.id, todayISO())} className={chip}>
              Schedule today
            </button>
            <button
              type="button"
              onClick={() => schedule(current.id, toISODate(addDays(fromISODate(todayISO()), 1)))}
              className={chip}
            >
              tomorrow
            </button>
          </div>
        </div>
      )}
      {candidates.length === 0 && backlog.length > 0 && (
        <p className="mt-2 text-11 text-text-3">nothing in the backlog fits these filters</p>
      )}
    </>
  );
}
