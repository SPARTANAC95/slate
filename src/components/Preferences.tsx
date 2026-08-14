import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { isTauri } from '../lib/platform';
import {
  backupLocation,
  getApiKeys,
  isAutostartEnabled,
  revealBackup,
  setApiKeys,
  setAutostart,
} from '../lib/desktop';
import { checkAndNotify, notificationsEnabled, setNotificationsEnabled } from '../lib/notify';
import { Toggle } from './Toggle';

const field =
  'w-full rounded-lg border border-line bg-transparent px-2 py-1.5 font-mono text-12 ' +
  'text-text transition-colors duration-150 focus:border-line-strong focus:outline-none';

export function Preferences({ onClose, onNote }: { onClose: () => void; onNote: (t: string) => void }) {
  const desktop = isTauri();
  const [tmdb, setTmdb] = useState('');
  const [rawg, setRawg] = useState('');
  const [notify, setNotify] = useState(notificationsEnabled());
  const [autostart, setAuto] = useState(false);
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    getApiKeys().then((k) => {
      if (!k) return;
      setTmdb(k.tmdb);
      setRawg(k.rawg);
    });
    isAutostartEnabled().then(setAuto);
    backupLocation().then(setPath);
  }, []);

  const save = async () => {
    if (desktop) await setApiKeys({ tmdb: tmdb.trim(), rawg: rawg.trim() });
    setNotificationsEnabled(notify);
    await setAutostart(autostart);
    onNote('preferences saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/60" onMouseDown={onClose}>
      <div
        className="panel-lit fade-in mx-auto mt-[14vh] w-[420px] rounded-xl border border-line bg-panel p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="section-label mb-3">preferences</div>

        {desktop ? (
          <>
            <div className="section-label mb-1.5">api keys</div>
            <label className="mb-2 block">
              <span className="mb-1 block text-11 text-text-3">
                tmdb — films and series, from themoviedb.org
              </span>
              <input
                value={tmdb}
                onChange={(e) => setTmdb(e.target.value)}
                aria-label="tmdb key"
                spellCheck={false}
                className={field}
              />
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block text-11 text-text-3">
                rawg — games, from rawg.io/apidocs
              </span>
              <input
                value={rawg}
                onChange={(e) => setRawg(e.target.value)}
                aria-label="rawg key"
                spellCheck={false}
                className={field}
              />
            </label>
          </>
        ) : (
          <p className="mb-3 text-11 text-text-3">
            api keys come from <span className="font-mono text-text-2">.env</span> when running in
            a browser — the desktop app stores them itself
          </p>
        )}

        <div className="border-t border-line pt-3">
          <Toggle
            label="remind me about today"
            hint="one notification a day for whatever is scheduled"
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
            onClick={() => checkAndNotify(true).then((sent) => onNote(sent ? 'notification sent' : 'nothing scheduled today'))}
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
