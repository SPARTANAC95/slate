import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { purgeExpiredDeleted } from './db';
import { requestPersistentStorage, startBackups } from './db/backup';
import { useLiveEntries } from './db/hooks';
import { monthName, todayISO } from './lib/dates';
import { MonthGrid } from './components/MonthGrid';
import { DayPanel } from './components/DayPanel';

export default function App() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const [selected, setSelected] = useState<string>(todayISO());
  const entries = useLiveEntries() ?? [];

  useEffect(() => {
    purgeExpiredDeleted();
    requestPersistentStorage();
    return startBackups();
  }, []);

  const move = (delta: -1 | 1) => {
    setDirection(delta === 1 ? 'next' : 'prev');
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToday = () => {
    const t = new Date();
    setDirection(null);
    setCursor({ year: t.getFullYear(), month: t.getMonth() });
    setSelected(todayISO());
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] gap-5 px-6 py-6">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="mb-4 flex items-baseline gap-3">
          <h1 className="text-18 font-semibold tracking-[-0.02em]">
            {monthName(cursor.month)}{' '}
            <span className="font-mono text-18 font-normal text-text-2">{cursor.year}</span>
          </h1>
          <div className="ml-auto flex items-center gap-1">
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

        <MonthGrid
          year={cursor.year}
          month={cursor.month}
          direction={direction}
          entries={entries}
          selected={selected}
          onSelect={setSelected}
        />
      </main>

      <DayPanel date={selected} entries={entries} />
    </div>
  );
}
