import { useEffect, useRef, useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { isTauri } from '../lib/platform';
import type { GoogleCalendar, GoogleStatus } from '../lib/googleCalendar';
import { getGoogleProgress, googleCall, googleError, googleExclusive, syncGoogleNow, watchGoogleProgress } from '../db/googleSync';

const button = 'rounded-lg border border-line px-3 py-1.5 text-12 text-text-2 hover:bg-panel-hover disabled:opacity-40';

export function GoogleCalendarPanel() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(getGoogleProgress);
  const file = useRef<HTMLInputElement>(null);
  const desktop = isTauri();

  const refresh = async () => {
    const value = await googleCall<GoogleStatus>('google_status');
    setStatus(value); setSelected(value.calendarId);
    if (value.connected) setCalendars((await googleCall<GoogleCalendar[]>('google_calendars')).filter((c) => ['owner', 'writer'].includes(c.accessRole)));
    return value;
  };
  useEffect(() => {
    if (desktop) void refresh().catch((e) => setError(googleError(e)));
    return watchGoogleProgress(setProgress);
  }, []);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError('');
    try { await googleExclusive(action); } catch (e) { setError(googleError(e)); }
    finally { setBusy(''); }
  };
  const choose = async (enabled: boolean) => {
    await run(enabled ? 'Enabling sync…' : 'Pausing…', async () => {
      const calendar = calendars.find((c) => c.id === selected);
      const value = await googleCall<GoogleStatus>('google_select', { calendarId: selected, calendarName: calendar?.summary ?? status?.calendarName ?? '', mode: 'push', enabled });
      setStatus(value);
    });
    void syncGoogleNow();
  };
  const openSetup = async () => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl('https://console.cloud.google.com/apis/credentials');
  };

  return <section className="mb-4 border-b border-line pb-4" aria-label="Google Calendar sync">
    <div className="mb-2 flex items-center gap-2"><Cloud size={15} className="text-text-3" /><h2 className="text-13 font-medium">Google Calendar</h2><span className="ml-auto font-mono text-10 text-text-3">Slate → Google</span></div>
    <p className="mb-3 text-12 leading-relaxed text-text-3">Your dated entries, notes, and links appear in Google Calendar. Edit them in Slate; changes sync while Slate runs, including in the tray. Daily journal notes stay local.</p>
    {!desktop ? <p className="text-12 text-text-2">Open the Slate Windows app to connect your Google account.</p> : <>
      {!status?.configured && <details open className="mb-3 rounded-lg border border-line p-3 text-12 text-text-2">
        <summary className="cursor-pointer font-medium">One-time Google setup</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-4 text-text-3">
          <li>Create a Google Cloud project and enable <strong>Google Calendar API</strong>.</li>
          <li>Configure Google Auth Platform with the app name Slate. Choose External and add your Google account as a test user.</li>
          <li>Create an OAuth client of type <strong>Desktop app</strong>, then download its JSON file.</li>
          <li>Import that file here, then connect with Google.</li>
        </ol>
        <button type="button" onClick={() => void run('Opening Google…', openSetup)} className={`${button} mt-3`}>Open Google Cloud</button>
        <p className="mt-2 text-11 text-text-3">Google apps left in Testing may need reconnection every 7 days.</p>
      </details>}
      <input ref={file} type="file" accept=".json,application/json" aria-label="Google OAuth credentials JSON" className="hidden" onChange={(e) => {
        const picked = e.target.files?.[0]; e.target.value = '';
        if (picked) void run('Importing credentials…', async () => {
          if (picked.size > 64_000) throw new Error('Choose the small Desktop OAuth credentials JSON from Google Cloud.');
          setStatus(await googleCall<GoogleStatus>('google_configure', { credentials: await picked.text() }));
        });
      }} />
      {!status?.connected && <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!!busy} onClick={() => file.current?.click()}>{status?.configured ? 'Replace credentials JSON' : 'Import credentials JSON'}</button>
        {status?.configured && <button type="button" className={button} disabled={!!busy} onClick={() => void run('Complete sign-in in your browser…', async () => { await googleCall('google_connect'); await refresh(); })}>Connect with Google</button>}
      </div>}
      {status?.connected && <>
        <label className="mb-2 block text-12 text-text-2">Google calendar
          <select aria-label="Google calendar" className="mt-1 w-full rounded-lg border border-line bg-panel px-2 py-2 text-12 text-text" value={selected} disabled={!!busy || status.enabled} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a calendar…</option>
            {calendars.map((c) => <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (primary)' : ''}</option>)}
          </select>
        </label>
        <p className="mb-3 text-11 leading-relaxed text-text-3">{status.enabled ? 'Pause sync to switch calendars. Copies in the old calendar are kept.' : 'Starting sync copies all dated Slate entries into this calendar. Deleting or unscheduling an entry in Slate removes its Google copy.'} Timed entries occupy one hour; annual entries repeat yearly.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={!!busy || !selected} onClick={() => void choose(!status.enabled)}>{status.enabled ? 'Pause sync' : 'Start syncing'}</button>
          {status.enabled && <button type="button" className={`${button} flex items-center gap-1.5`} disabled={!!busy || progress.state === 'syncing'} onClick={() => void syncGoogleNow()}><RefreshCw size={12} />Sync now</button>}
          <button type="button" className={button} disabled={!!busy} onClick={() => void run('Disconnecting…', async () => { setStatus(await googleCall<GoogleStatus>('google_disconnect')); setCalendars([]); }).then(() => syncGoogleNow())}>Disconnect</button>
          <button type="button" className={button} disabled={!!busy} onClick={() => void run('Complete sign-in in your browser…', async () => { await googleCall('google_connect'); await refresh(); })}>Reconnect</button>
        </div>
        <p className="mt-2 text-11 text-text-3">Disconnect keeps existing Google events and removes this device’s access tokens.</p>
      </>}
      <div aria-live="polite" className="mt-2 text-11 leading-relaxed text-text-3">
        {busy || error || (status?.connected ? status.enabled ? progress.message : status.calendarId ? 'Google sync is paused.' : 'Connected. Choose a calendar to start syncing.' : status?.configured ? 'Credentials ready. Connect your Google account.' : 'Not connected yet.')}
        {!busy && !error && progress.lastSync && status?.enabled && <span className="block">Last synced {new Date(progress.lastSync).toLocaleString()}</span>}
      </div>
    </>}
  </section>;
}
