import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { isTauri } from '../lib/platform';
import {
  backupLocation,
  checkApiKeys,
  getApiKeys,
  isAutostartEnabled,
  revealBackup,
  setApiKeys,
  setAutostart,
  type ApiKeys,
  type KeyCheck,
} from '../lib/desktop';
import { checkAndNotify, notificationsEnabled, setNotificationsEnabled } from '../lib/notify';
import { ApiKeysPanel } from './ApiKeysPanel';
import { Toggle } from './Toggle';
import { GoogleCalendarPanel } from './GoogleCalendarPanel';

export function Preferences({ onClose, onNote }: { onClose: () => void; onNote: (t: string) => void }) {
  const desktop = isTauri();
  const [tmdb, setTmdb] = useState('');
  const [igdbId, setIgdbId] = useState('');
  const [igdbSecret, setIgdbSecret] = useState('');
  const [notify, setNotify] = useState(notificationsEnabled());
  const [autostart, setAuto] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [keyCheck, setKeyCheck] = useState<KeyCheck | 'checking' | 'failed' | null>(null);

  useEffect(() => {
    getApiKeys().then((k) => {
      if (!k) return;
      setTmdb(k.tmdb);
      // a keys.json written before igdb arrived simply has nothing to restore
      setIgdbId(k.igdbId ?? '');
      setIgdbSecret(k.igdbSecret ?? '');
    });
    isAutostartEnabled().then(setAuto);
    backupLocation().then(setPath);
  }, []);

  const typed = (): ApiKeys => ({
    tmdb: tmdb.trim(),
    igdbId: igdbId.trim(),
    igdbSecret: igdbSecret.trim(),
  });

  const save = async () => {
    if (desktop) await setApiKeys(typed());
    setNotificationsEnabled(notify);
    await setAutostart(autostart);
    onNote('preferences saved');
    onClose();
  };

  /** save first, then ask the providers — testing the boxes, not the file */
  const testKeys = async () => {
    setKeyCheck('checking');
    if (desktop) await setApiKeys(typed());
    // a null here used to fall back to the "no keys checked yet" hint, so a
    // check that failed outright looked like one that was never run
    setKeyCheck((await checkApiKeys()) ?? 'failed');
  };

  const NOTIFY_OUTCOME = {
    sent: 'notification sent',
    quiet: 'reminders are off — turn them on above first',
    blocked: 'windows is blocking notifications from slate — allow it in system settings',
  } as const;

  return (
    <div className="fixed inset-0 z-30 bg-black/60" onMouseDown={onClose}>
      <div
        className="panel-lit fade-in mx-auto mt-[5vh] max-h-[90vh] w-[480px] max-w-[95vw] overflow-y-auto rounded-xl border border-line bg-panel p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="section-label mb-3">preferences</div>

        <GoogleCalendarPanel />

        <ApiKeysPanel
          desktop={desktop}
          tmdb={tmdb}
          igdbId={igdbId}
          igdbSecret={igdbSecret}
          onTmdb={setTmdb}
          onIgdbId={setIgdbId}
          onIgdbSecret={setIgdbSecret}
          check={keyCheck}
          onTest={testKeys}
        />

        <div className="border-t border-line pt-3">
          <Toggle
            label="remind me about today"
            hint="the day's list in the morning, and a nudge half an hour before anything with a time"
            checked={notify}
            onChange={setNotify}
          />
          {desktop && (
            <Toggle
              label="start with windows"
              hint="slate waits in the tray so reminders still arrive"
              checked={autostart}
              onChange={setAuto}
            />
          )}
        </div>

        {path && (
          <button
            type="button"
            onClick={revealBackup}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-left transition-colors duration-150 hover:bg-panel-hover"
          >
            <FolderOpen size={13} className="shrink-0 text-text-3" />
            <span className="min-w-0 flex-1 truncate font-mono text-11 text-text-3">{path}</span>
          </button>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="rounded-lg border border-line-strong bg-panel-hover px-3 py-1 text-12 text-text transition-colors duration-150 hover:bg-panel"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              // like the key test: try the box as it is now, not as it was saved
              setNotificationsEnabled(notify);
              checkAndNotify(true).then((outcome) => onNote(NOTIFY_OUTCOME[outcome]));
            }}
            className="rounded-lg px-2 py-1 text-12 text-text-3 transition-colors duration-150 hover:text-text-2"
          >
            Test notification
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-2 py-1 text-12 text-text-3 transition-colors duration-150 hover:text-text-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
