export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'saving' | 'installing' | 'error';
export type ReleaseInfo = { version: string; notes: string };
export type UpdateState = {
  phase: UpdatePhase;
  currentVersion: string;
  release: ReleaseInfo | null;
  automatic: boolean;
  downloaded: number;
  total: number | null;
  checkedAt: number | null;
  error: string | null;
  dismissed: boolean;
};
export type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };
export type UpdateHandle = {
  version: string;
  body?: string;
  download: (onEvent: (event: DownloadEvent) => void, options: { timeout: number }) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
};
type Dependencies = {
  currentVersion: string;
  automatic: boolean;
  saveAutomatic: (on: boolean) => void;
  check: () => Promise<UpdateHandle | null>;
  prepare: () => Promise<void | (() => void)>;
  now?: () => number;
};

export const updateBusy = (phase: UpdatePhase) =>
  phase === 'downloading' || phase === 'saving' || phase === 'installing';

/** One owner of the native update resource, shared by the banner and Preferences. */
export function createUpdateController(deps: Dependencies) {
  let state: UpdateState = {
    phase: 'idle', currentVersion: deps.currentVersion, release: null,
    automatic: deps.automatic, downloaded: 0, total: null, checkedAt: null,
    error: null, dismissed: false,
  };
  let handle: UpdateHandle | null = null;
  let checkJob: Promise<void> | null = null;
  let installJob: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const report = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    listeners.forEach(fn => fn());
  };
  const close = async (resource: UpdateHandle | null) => {
    try { await resource?.close(); } catch { /* already released by native process */ }
  };

  const check = (manual = true): Promise<void> => {
    if (installJob || updateBusy(state.phase)) return installJob ?? Promise.resolve();
    if (checkJob) return checkJob;
    if (!manual && !state.automatic) return Promise.resolve();
    const dismissedVersion = state.dismissed ? state.release?.version : null;
    report({ phase: 'checking', error: null });
    checkJob = Promise.resolve().then(async () => {
      try {
        const next = await deps.check();
        const previous = handle;
        handle = next;
        await close(previous);
        // Background checks disabled while a request was running should not
        // produce a new banner. The result remains available in Preferences.
        report({
          phase: next ? 'available' : 'current',
          release: next ? { version: next.version, notes: next.body ?? '' } : null,
          checkedAt: (deps.now ?? Date.now)(),
          dismissed: !manual && (!state.automatic || next?.version === dismissedVersion),
        });
      } catch {
        report({ phase: 'error', error: 'Could not check for updates. Check your connection and try again.' });
      } finally {
        checkJob = null;
      }
    });
    return checkJob;
  };

  const install = (): Promise<void> => {
    if (installJob) return installJob;
    if (checkJob || !handle || updateBusy(state.phase)) return Promise.resolve();
    const selected = handle;
    report({ phase: 'downloading', error: null, downloaded: 0, total: null, dismissed: false });
    installJob = Promise.resolve().then(async () => {
      let step: 'download' | 'save' | 'install' = 'download';
      let resume: void | (() => void) = undefined;
      try {
        // The native plugin verifies the signature before download resolves.
        await selected.download(event => {
          if (event.event === 'Started') {
            const length = event.data.contentLength;
            report({ total: length && Number.isFinite(length) && length > 0 ? length : null });
          } else if (event.event === 'Progress' && Number.isFinite(event.data.chunkLength) && event.data.chunkLength > 0) {
            report({ downloaded: state.downloaded + event.data.chunkLength });
          }
        }, { timeout: 120_000 });
        step = 'save';
        report({ phase: 'saving' });
        resume = await deps.prepare();
        step = 'install';
        report({ phase: 'installing' });
        // On Windows this exits the app only after the installer was started.
        // NSIS restarts the newly installed app; no second relaunch is needed.
        await selected.install();
      } catch {
        resume?.();
        const error = step === 'download'
          ? 'The update could not be downloaded or verified. Nothing was installed. Try again.'
          : step === 'save'
            ? 'Your latest changes could not be backed up. The update was stopped. Check disk access and try again.'
            : 'The installer could not start. Nothing was replaced. Try again or download the installer from Releases.';
        report({ phase: 'error', error });
      } finally {
        installJob = null;
      }
    });
    return installJob;
  };

  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    check,
    install,
    dismiss: () => { if (!updateBusy(state.phase)) report({ dismissed: true }); },
    setAutomatic: (on: boolean) => {
      try { deps.saveAutomatic(on); } catch {
        report({ error: 'Could not save the automatic update setting.' });
        return;
      }
      report({ automatic: on, error: null });
    },
  };
}
