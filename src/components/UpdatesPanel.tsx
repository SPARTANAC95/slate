import { useEffect, useRef } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { isTauri } from '../lib/platform';
import { updates, useUpdates } from '../lib/updates';
import { updateBusy } from '../lib/updateController';
import { Toggle } from './Toggle';

const button = 'rounded-lg border border-line-strong bg-panel-hover px-3 py-1.5 text-12 text-text hover:bg-panel disabled:opacity-50';

export function UpdatesPanel() {
  const state = useUpdates();
  const desktop = isTauri();
  const busy = updateBusy(state.phase) || state.phase === 'checking';
  return (
    <section className="mb-4 rounded-lg border border-line p-3" aria-label="App updates">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-12 text-text">App updates</span>
        <span className="font-mono text-11 text-text-3">Slate {state.currentVersion}</span>
      </div>
      {desktop ? <>
        <Toggle label="Check for updates automatically" hint="On startup and every six hours. You choose when to install. This setting saves immediately."
          checked={state.automatic} onChange={updates.setAutomatic} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void updates.check()}>
            {state.phase === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
          {state.release && <button type="button" className={button} disabled={busy} onClick={() => void updates.install()}>
            Install {state.release.version} and restart
          </button>}
        </div>
        <p className="mt-2 text-11 text-text-3" role="status">
          {state.phase === 'current' ? 'You’re up to date.' : state.release
            ? `Slate ${state.release.version} is available. Save any open form before installing. Your calendar is backed up before restart.`
            : 'Updates come from the official Slate releases on GitHub.'}
        </p>
        {state.error && <p role="alert" className="mt-2 text-12 text-amber-300">{state.error}</p>}
        {state.release?.notes && <details className="mt-2 text-11 text-text-3">
          <summary className="cursor-pointer">What’s new</summary>
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{state.release.notes}</p>
        </details>}
      </> : <p className="text-12 text-text-3">Update checks are available in the installed Windows app.</p>}
    </section>
  );
}

export function UpdateNotice({ onDetails }: { onDetails: () => void }) {
  const state = useUpdates();
  if (!isTauri() || !state.release || state.dismissed || updateBusy(state.phase)) return null;
  return <div className="mx-7 mb-3 flex items-center gap-3 rounded-lg border border-line-strong bg-panel px-3 py-2 text-12" role="status">
    <Download size={15} className="shrink-0 text-text-2" />
    <span className="flex-1 text-text-2">{state.error ? 'Update paused. Open details to retry.' : `Slate ${state.release.version} is ready to install.`}</span>
    <button type="button" className={button} onClick={onDetails}>Update details</button>
    <button type="button" className="px-2 text-text-3 hover:text-text" onClick={updates.dismiss}>Later</button>
  </div>;
}

/** Sibling of the inert app, so keyboard and pointer edits stop during backup. */
export function UpdateProgress() {
  const state = useUpdates();
  const active = updateBusy(state.phase);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) ref.current?.focus(); }, [active]);
  if (!active) return null;
  const percent = state.total ? Math.min(100, Math.round(state.downloaded / state.total * 100)) : null;
  const title = state.phase === 'saving' ? 'Saving your calendar…'
    : state.phase === 'installing' ? 'Restarting Slate…' : `Downloading Slate ${state.release?.version}…`;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6">
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="update-title"
      className="w-full max-w-sm rounded-xl border border-line-strong bg-panel p-6 outline-none"
      onKeyDown={event => { if (event.key === 'Tab') event.preventDefault(); }}>
      <RefreshCw size={22} className="mb-4 animate-spin text-text-2" />
      <h2 id="update-title" className="text-16 text-text">{title}</h2>
      <p className="mt-2 text-12 text-text-3">Keep Slate open. It will save a backup, install the verified update, and reopen automatically.</p>
      {state.phase === 'downloading' && <>
        <progress className="mt-4 h-1.5 w-full accent-emerald-400" aria-label="Update download" max={100} value={percent ?? undefined} />
        <p className="mt-2 font-mono text-11 text-text-3" aria-live="polite">{percent === null ? `${(state.downloaded / 1048576).toFixed(1)} MB downloaded` : `${percent}%`}</p>
      </>}
    </div>
  </div>;
}
