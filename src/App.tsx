import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { purgeExpiredDeleted } from './db';
import { requestPersistentStorage, startBackups } from './db/backup';
import { markRefreshed, refreshExternalDates, shouldAutoRefresh } from './db/refresh';
import { useLiveEntries } from './db/hooks';
import { fromISODate, monthName, todayISO } from './lib/dates';
import { MonthGrid } from './components/MonthGrid';
import { DayPanel } from './components/DayPanel';
import { QuickAdd } from './components/QuickAdd';
import { CountdownRail } from './components/CountdownRail';
import { Backlog } from './components/Backlog';
import { YearView } from './components/YearView';

export default function App() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const [selected, setSelected] = useState<string>(todayISO());
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [showBacklog, setShowBacklog] = useState(false);
  const [view, setView] = useState<'month' | 'year'>('month');
  const [yearCursor, setYearCursor] = useState(now.getFullYear());
  const entries = useLiveEntries() ?? [];
  const backlogCount = entries.filter((e) => e.date === null).length;

  const runRefresh = async () => {
    setRefreshNote('checking…');
    const { checked, moved } = await refreshExternalDates();
    markRefreshed();
    setRefreshNote(checked === 0 ? 'nothing to refresh' : `checked ${checked} — ${moved} moved`);
    setTimeout(() => setRefreshNote(null), 5000);
  };

  useEffect(() => {
    purgeExpiredDeleted();
    requestPersistentStorage();
    if (shouldAutoRefresh()) runRefresh(); // once per day on open
    return startBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (delta: -1 | 1) => {
    if (view === 'year') return setYearCursor((y) => y + delta);
    setDirection(delta === 1 ? 'next' : 'prev');
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const jumpTo = (date: string | null) => {
    if (!date) return;
    const d = fromISODate(date);
    setView('month');
    setDirection(null);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(date);
  };

  const goToday = () => {
    const t = new Date();
    setView('month');
    setDirection(null);
    setCursor({ year: t.getFullYear(), month: t.getMonth() });
    setSelected(todayISO());
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-7 pb-4 pt-5">
        <span className="flex items-center gap-3">
          <span className="text-13 font-medium tracking-[-0.02em] text-text-3">slate</span>
          <button
            type="button"
            onClick={() => setShowBacklog((v) => !v)}
            aria-pressed={showBacklog}
            className={`rounded-lg border px-2.5 py-1 text-12 transition-colors duration-150 hover:bg-panel-hover hover:text-text ${
              showBacklog ? 'border-line-strong bg-panel-hover text-text' : 'border-line text-text-2'
            }`}
          >
            backlog <span className="font-mono text-11 text-text-3">{backlogCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setView((v) => (v === 'year' ? 'month' : 'year'))}
            aria-pressed={view === 'year'}
            className={`rounded-lg border px-2.5 py-1 text-12 transition-colors duration-150 hover:bg-panel-hover hover:text-text ${
              view === 'year' ? 'border-line-strong bg-panel-hover text-text' : 'border-line text-text-2'
            }`}
          >
            year
          </button>
        </span>
        <h1 className="text-18 font-semibold tracking-[-0.02em]">
          {view === 'year' ? (
            <span className="font-mono font-normal">{yearCursor}</span>
          ) : (
            <>
              {monthName(cursor.month)}{' '}
              <span className="font-mono text-18 font-normal text-text-2">{cursor.year}</span>
            </>
          )}
        </h1>
        <div className="flex items-center justify-end gap-1">
          {refreshNote && <span className="mr-2 text-11 text-text-3">{refreshNote}</span>}
          <button
            type="button"
            onClick={runRefresh}
            disabled={refreshNote === 'checking…'}
            aria-label="refresh dates"
            title="Refresh dates"
            className="mr-1 rounded-lg border border-line p-1.5 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text disabled:opacity-60"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="previous month"
            className="rounded-lg border border-line p-1.5 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="next month"
            className="rounded-lg border border-line p-1.5 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 rounded-lg border border-line px-2.5 py-1 text-12 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
          >
            today
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5 px-7 pb-6">
        {view === 'year' ? (
          <YearView entries={entries} year={yearCursor} onJumpToDay={jumpTo} />
        ) : (
          <>
            {showBacklog && <Backlog entries={entries} />}
            <main className="flex min-w-0 flex-1 flex-col">
              <QuickAdd onAdded={jumpTo} />
              <CountdownRail entries={entries} onJump={jumpTo} />
              <div className="min-h-0 flex-1">
                <MonthGrid
                  year={cursor.year}
                  month={cursor.month}
                  direction={direction}
                  entries={entries}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
            </main>

            <DayPanel date={selected} entries={entries} />
          </>
        )}
      </div>
    </div>
  );
}
