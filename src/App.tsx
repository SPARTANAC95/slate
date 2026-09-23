import { useEffect, useRef, useState } from 'react';
import { addDays } from 'date-fns';
import { purgeExpiredDeleted } from './db';
import { requestPersistentStorage, startBackups, type BackupStatus } from './db/backup';
import { markRefreshed, refreshExternalDates, shouldAutoRefresh } from './db/refresh';
import {
  applyImport,
  exportToFile,
  planImport,
  planRestoreFromDisk,
  type ImportPlan,
} from './db/transfer';
import { useLiveEntries } from './db/hooks';
import { fromISODate, toISODate, todayISO } from './lib/dates';
import { useShortcuts } from './lib/useShortcuts';
import { useToday } from './lib/useToday';
import { startNotifications } from './lib/notify';
import { Header } from './components/Header';
import { MonthGrid } from './components/MonthGrid';
import { DayPanel } from './components/DayPanel';
import { QuickAdd } from './components/QuickAdd';
import { CountdownRail } from './components/CountdownRail';
import { Backlog } from './components/Backlog';
import { YearView } from './components/YearView';
import { UpcomingView } from './components/UpcomingView';
import { CommandPalette } from './components/CommandPalette';
import { HelpSheet } from './components/HelpSheet';
import { ImportDialog } from './components/ImportDialog';
import { Preferences } from './components/Preferences';
import { startGoogleSync } from './db/googleSync';
import { startUpdateChecks, useUpdates } from './lib/updates';
import { updateBusy } from './lib/updateController';
import { UpdateNotice, UpdateProgress } from './components/UpdatesPanel';

export default function App() {
  const updateState = useUpdates();
  const updating = updateBusy(updateState.phase);
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (appRef.current) appRef.current.inert = updating;
  }, [updating]);
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const [selected, setSelected] = useState<string>(todayISO());
  const [view, setView] = useState<'month' | 'year' | 'upcoming'>('month');
  const [yearCursor, setYearCursor] = useState(now.getFullYear());
  const [showBacklog, setShowBacklog] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [importState, setImportState] = useState<{
    plan: ImportPlan;
    fileName: string;
    /** offered by the app from the disk mirror, not picked by the user */
    restore?: boolean;
  } | null>(null);
  const restoreOffered = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [backup, setBackup] = useState<BackupStatus>({ state: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);
  // moves at midnight, so a window left open overnight wakes up on the right day
  const today = useToday();
  const lastToday = useRef(today);
  // undefined until indexeddb opens — "loading" and "empty" are different
  const loaded = useLiveEntries();
  const entries = loaded ?? [];
  const backlogCount = entries.filter((e) => e.date === null).length;

  const flash = (text: string) => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 5000);
  };

  const runRefresh = async () => {
    // one at a time; a second click mid-check would race the first
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    // a plain note, not a flash: an earlier flash's timer used to clear
    // "checking…" halfway through, which also re-enabled the button
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote('checking…');
    try {
      const { checked, answered, moved, kept } = await refreshExternalDates();
      if (checked > 0 && answered === 0) {
        // nobody answered — say so, and leave today unmarked so the next
        // open tries again instead of "checked 12 — 0 moved" from an unplugged cable
        flash('could not reach the providers — dates unchanged');
        return;
      }
      markRefreshed();
      // "kept" is the reassurance that a date I chose survived the check
      const keptNote = kept > 0 ? `, ${kept} kept my date` : '';
      const count = answered < checked ? `${answered} of ${checked}` : String(checked);
      flash(checked === 0 ? 'nothing to refresh' : `checked ${count} — ${moved} moved${keptNote}`);
    } catch {
      // never leave the header stuck on "checking…" — that also wedges the button
      flash('refresh failed — dates are unchanged');
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    requestPersistentStorage();
    // focus quick add once on open — later, `n` brings it back without
    // stealing focus from single-letter shortcuts on view switches
    document.getElementById('quick-add')?.focus();
    const stopBackups = startBackups(setBackup);
    const stopNotifications = startNotifications();
    const stopGoogleSync = startGoogleSync();
    const stopUpdates = startUpdateChecks();
    return () => {
      stopBackups();
      stopNotifications();
      stopGoogleSync();
      stopUpdates();
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  // an empty database with a disk backup beside it gets offered the backup,
  // once, as soon as we know the database really is empty rather than loading
  useEffect(() => {
    if (loaded === undefined || restoreOffered.current) return;
    restoreOffered.current = true;
    planRestoreFromDisk().then((plan) => {
      if (plan) setImportState({ plan, fileName: 'slate-backup.json', restore: true });
    });
  }, [loaded]);

  // the once-a-day jobs: on open, and again each time a running window
  // crosses midnight — the tray app is never reopened, so "on open" alone
  // meant a refresh that ran once and a purge that never did
  useEffect(() => {
    purgeExpiredDeleted();
    if (shouldAutoRefresh()) runRefresh();
    // a selection left on "today" overnight follows the day; one parked on
    // some other date was a choice and stays put
    if (lastToday.current !== today) {
      const wasOnToday = selected === lastToday.current;
      lastToday.current = today;
      if (wasOnToday) {
        setSelected(today);
        showMonthOf(today); // a month boundary at midnight would otherwise hide it
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const showMonthOf = (date: string) => {
    const d = fromISODate(date);
    setCursor((cur) =>
      cur.year === d.getFullYear() && cur.month === d.getMonth()
        ? cur
        : { year: d.getFullYear(), month: d.getMonth() },
    );
  };

  /** whole pages: months in month view, years in year view, nothing in a list */
  const movePage = (delta: -1 | 1) => {
    if (view === 'upcoming') return;
    if (view === 'year') return setYearCursor((y) => y + delta);
    setDirection(delta === 1 ? 'next' : 'prev');
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  /** walk the selection by days; the grid follows across month boundaries */
  const moveDay = (delta: number) => {
    if (view === 'upcoming') return;
    if (view === 'year') return setYearCursor((y) => y + (delta > 0 ? 1 : -1));
    const next = toISODate(addDays(fromISODate(selected), delta));
    setDirection(delta > 0 ? 'next' : 'prev');
    setSelected(next);
    showMonthOf(next);
  };

  const jumpTo = (date: string | null) => {
    if (!date) return setShowBacklog(true);
    setView('month');
    setDirection(null);
    setSelected(date);
    showMonthOf(date);
  };

  const goToday = () => jumpTo(todayISO());
  const toggleYear = () => setView((v) => (v === 'year' ? 'month' : 'year'));
  const toggleUpcoming = () => setView((v) => (v === 'upcoming' ? 'month' : 'upcoming'));

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
    movePage,
    moveDay,
    today: goToday,
    year: toggleYear,
    upcoming: toggleUpcoming,
    backlog: () => setShowBacklog((v) => !v),
    help: () => setHelpOpen((v) => !v),
    blocked: () => updating || helpOpen || prefsOpen || importState !== null,
    escape: () => {
      if (updating) return true;
      if (importState) return setImportState(null), true;
      if (prefsOpen) return setPrefsOpen(false), true;
      if (helpOpen) return setHelpOpen(false), true;
      if (paletteOpen) return setPaletteOpen(false), true;
      if (showBacklog) return setShowBacklog(false), true;
      return false;
    },
  });

  return (
    <>
    <div ref={appRef} className="flex h-full flex-col overflow-hidden">
      <Header
        onPreferences={() => setPrefsOpen(true)}
        view={view}
        cursor={cursor}
        yearCursor={yearCursor}
        showBacklog={showBacklog}
        backlogCount={backlogCount}
        note={note}
        refreshBusy={refreshing}
        backup={backup}
        onMove={movePage}
        onToday={goToday}
        onRefresh={runRefresh}
        onToggleBacklog={() => setShowBacklog((v) => !v)}
        onToggleYear={toggleYear}
        onToggleUpcoming={toggleUpcoming}
      />

      <UpdateNotice onDetails={() => setPrefsOpen(true)} />
      <div className="flex min-h-0 flex-1 gap-5 px-7 pb-6">
        {view === 'upcoming' ? (
          <UpcomingView entries={entries} onJumpToDay={jumpTo} />
        ) : view === 'year' ? (
          <YearView entries={entries} year={yearCursor} onJumpToDay={jumpTo} />
        ) : (
          <>
            {showBacklog && <Backlog entries={entries} />}
            <main className="flex min-w-0 flex-1 flex-col">
              <QuickAdd onAdded={jumpTo} onNote={flash} />
              {loaded !== undefined && entries.length === 0 && (
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
        onToggleYear={toggleYear}
        onToggleUpcoming={toggleUpcoming}
        onExport={() => {
          exportToFile().then(
            (path) => flash(path ? 'exported to downloads' : 'exported'),
            () => flash('export failed — nothing was written'),
          );
        }}
        onImport={() => fileRef.current?.click()}
        onShowHelp={() => setHelpOpen(true)}
        onShowPreferences={() => setPrefsOpen(true)}
      />
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
      {prefsOpen && <Preferences onClose={() => setPrefsOpen(false)} onNote={flash} />}
      {importState && (
        <ImportDialog
          plan={importState.plan}
          fileName={importState.fileName}
          restore={importState.restore}
          onConfirm={async () => {
            try {
              await applyImport(importState.plan);
              flash(importState.restore ? 'restored from the disk backup' : 'imported');
            } catch {
              flash('import failed — nothing was changed');
            } finally {
              // the dialog must always close, or it looks frozen
              setImportState(null);
            }
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
    <UpdateProgress />
    </>
  );
}
