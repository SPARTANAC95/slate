import { useEffect, useRef, useState } from 'react';
import { purgeExpiredDeleted } from './db';
import { requestPersistentStorage, startBackups } from './db/backup';
import { markRefreshed, refreshExternalDates, shouldAutoRefresh } from './db/refresh';
import { applyImport, exportToFile, planImport, type ImportPlan } from './db/transfer';
import { useLiveEntries } from './db/hooks';
import { fromISODate, todayISO } from './lib/dates';
import { useShortcuts } from './lib/useShortcuts';
import { Header } from './components/Header';
import { MonthGrid } from './components/MonthGrid';
import { DayPanel } from './components/DayPanel';
import { QuickAdd } from './components/QuickAdd';
import { CountdownRail } from './components/CountdownRail';
import { Backlog } from './components/Backlog';
import { YearView } from './components/YearView';
import { CommandPalette } from './components/CommandPalette';
import { HelpSheet } from './components/HelpSheet';
import { ImportDialog } from './components/ImportDialog';

export default function App() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const [selected, setSelected] = useState<string>(todayISO());
  const [view, setView] = useState<'month' | 'year'>('month');
  const [yearCursor, setYearCursor] = useState(now.getFullYear());
  const [showBacklog, setShowBacklog] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [importState, setImportState] = useState<{ plan: ImportPlan; fileName: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const entries = useLiveEntries() ?? [];
  const backlogCount = entries.filter((e) => e.date === null).length;

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(null), 5000);
  };

  const runRefresh = async () => {
    setNote('checking…');
    const { checked, moved } = await refreshExternalDates();
    markRefreshed();
    flash(checked === 0 ? 'nothing to refresh' : `checked ${checked} — ${moved} moved`);
  };

  useEffect(() => {
    purgeExpiredDeleted();
    requestPersistentStorage();
    if (shouldAutoRefresh()) runRefresh(); // once per day on open
    // focus quick add once on open — later, `n` brings it back without
    // stealing focus from single-letter shortcuts on view switches
    document.getElementById('quick-add')?.focus();
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
    if (!date) return setShowBacklog(true);
    const d = fromISODate(date);
    setView('month');
    setDirection(null);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(date);
  };

  const goToday = () => jumpTo(todayISO());

  const onFilePicked = async (file: File) => {
    try {
      const plan = await planImport(JSON.parse(await file.text()));
      if (!plan) throw new Error('bad shape');
      setImportState({ plan, fileName: file.name });
    } catch {
      flash('import failed — that is not a slate export');
    }
  };

  useShortcuts({
    palette: () => setPaletteOpen((v) => !v),
    quickAdd: () => document.getElementById('quick-add')?.focus(),
    move,
    today: goToday,
    year: () => setView((v) => (v === 'year' ? 'month' : 'year')),
    backlog: () => setShowBacklog((v) => !v),
    help: () => setHelpOpen((v) => !v),
    escape: () => {
      if (importState) return setImportState(null), true;
      if (helpOpen) return setHelpOpen(false), true;
      if (paletteOpen) return setPaletteOpen(false), true;
      if (showBacklog) return setShowBacklog(false), true;
      return false;
    },
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        view={view}
        cursor={cursor}
        yearCursor={yearCursor}
        showBacklog={showBacklog}
        backlogCount={backlogCount}
        note={note}
        refreshBusy={note === 'checking…'}
        onMove={move}
        onToday={goToday}
        onRefresh={runRefresh}
        onToggleBacklog={() => setShowBacklog((v) => !v)}
        onToggleYear={() => setView((v) => (v === 'year' ? 'month' : 'year'))}
      />

      <div className="flex min-h-0 flex-1 gap-5 px-7 pb-6">
        {view === 'year' ? (
          <YearView entries={entries} year={yearCursor} onJumpToDay={jumpTo} />
        ) : (
          <>
            {showBacklog && <Backlog entries={entries} />}
            <main className="flex min-w-0 flex-1 flex-col">
              <QuickAdd onAdded={jumpTo} />
              {entries.length === 0 && (
                <p className="mb-3 px-3 text-12 text-text-3">
                  nothing scheduled yet — type a title and a date above, like{' '}
                  <span className="font-mono text-text-2">album drop oct 22</span>, and press
                  enter — <span className="font-mono text-text-2">ctrl k</span> for everything
                  else
                </p>
              )}
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        entries={entries}
        onJump={jumpTo}
        onToggleYear={() => setView((v) => (v === 'year' ? 'month' : 'year'))}
        onExport={() => {
          exportToFile();
          flash('exported');
        }}
        onImport={() => fileRef.current?.click()}
        onShowHelp={() => setHelpOpen(true)}
      />
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
      {importState && (
        <ImportDialog
          plan={importState.plan}
          fileName={importState.fileName}
          onConfirm={async () => {
            await applyImport(importState.plan);
            setImportState(null);
            flash('imported');
          }}
          onCancel={() => setImportState(null)}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFilePicked(file);
        }}
      />
    </div>
  );
}
