import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { monthName } from '../lib/dates';
import type { BackupStatus } from '../db/backup';
import { BackupIndicator } from './BackupIndicator';
import { GoogleSyncIndicator } from './GoogleSyncIndicator';

type Props = {
  view: 'month' | 'year' | 'upcoming';
  cursor: { year: number; month: number };
  yearCursor: number;
  showBacklog: boolean;
  backlogCount: number;
  note: string | null;
  refreshBusy: boolean;
  backup: BackupStatus;
  onMove: (delta: -1 | 1) => void;
  onToday: () => void;
  onRefresh: () => void;
  onToggleBacklog: () => void;
  onToggleYear: () => void;
  onToggleUpcoming: () => void;
  onPreferences: () => void;
};

const toggle = (active: boolean) =>
  `rounded-lg border px-2.5 py-1 text-12 transition-colors duration-150 hover:bg-panel-hover hover:text-text ${
    active ? 'border-line-strong bg-panel-hover text-text' : 'border-line text-text-2'
  }`;

const navBtn =
  'rounded-lg border border-line p-1.5 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text';

export function Header(p: Props) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center px-7 pb-4 pt-5">
      <span className="flex items-center gap-3">
        <span className="text-13 font-medium tracking-[-0.02em] text-text-3">slate</span>
        <button type="button" onClick={p.onToggleBacklog} aria-pressed={p.showBacklog} className={toggle(p.showBacklog)}>
          backlog <span className="font-mono text-11 text-text-3">{p.backlogCount}</span>
        </button>
        <button type="button" onClick={p.onToggleYear} aria-pressed={p.view === 'year'} className={toggle(p.view === 'year')}>
          year
        </button>
        <button
          type="button"
          onClick={p.onToggleUpcoming}
          aria-pressed={p.view === 'upcoming'}
          className={toggle(p.view === 'upcoming')}
        >
          upcoming
        </button>
      </span>

      <h1 className="text-18 font-semibold tracking-[-0.02em]">
        {p.view === 'upcoming' ? (
          <span className="font-normal text-text-2">upcoming</span>
        ) : p.view === 'year' ? (
          <span className="font-mono font-normal">{p.yearCursor}</span>
        ) : (
          <>
            {monthName(p.cursor.month)}{' '}
            <span className="font-mono text-18 font-normal text-text-2">{p.cursor.year}</span>
          </>
        )}
      </h1>

      <div className="flex items-center justify-end gap-1">
        {p.note && <span className="mr-2 text-11 text-text-3">{p.note}</span>}
        <BackupIndicator status={p.backup} />
        <GoogleSyncIndicator onClick={p.onPreferences} />
        <button
          type="button"
          onClick={p.onRefresh}
          disabled={p.refreshBusy}
          aria-label="refresh dates"
          title="Refresh dates"
          className={`${navBtn} mr-1 disabled:opacity-60`}
        >
          <RefreshCw size={14} />
        </button>
        {/* one list of everything has no pages to turn */}
        {p.view !== 'upcoming' && (
          <>
            <button
              type="button"
              onClick={() => p.onMove(-1)}
              aria-label={p.view === 'year' ? 'previous year' : 'previous month'}
              className={navBtn}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => p.onMove(1)}
              aria-label={p.view === 'year' ? 'next year' : 'next month'}
              className={navBtn}
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={p.onToday}
          className="ml-1 rounded-lg border border-line px-2.5 py-1 text-12 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
        >
          today
        </button>
      </div>
    </header>
  );
}
