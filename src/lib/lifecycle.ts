import { isTauri } from './platform';
import { textSaves } from './textSaveQueue';

type Listener = () => void;

const listeners = new Set<Listener>();
const updateListeners = new Set<() => Promise<void>>();
let wired = false;

const fire = () => {
  for (const fn of [...listeners]) fn();
};

function wire() {
  if (wired) return;
  wired = true;
  addEventListener('pagehide', fire);
  addEventListener('beforeunload', fire);
  if (isTauri()) {
    // Quit from the tray menu ends the process without the page ever unloading,
    // so the rust side announces it first and waits a beat — this is the only
    // warning a half-typed note or a pending disk mirror gets.
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen('slate:quit', fire))
      .catch(() => {});
  }
}

/**
 * "The window is about to go away — commit what you have." One seam for the
 * three ways that happens: a browser tab unloading, the page being hidden for
 * good, and the tray app quitting.
 */
export function onWindowGoingAway(fn: Listener): () => void {
  wire();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Await text writes before an updater is allowed to terminate the process. */
export function onBeforeUpdate(fn: () => Promise<void>): () => void {
  updateListeners.add(fn);
  return () => { updateListeners.delete(fn); };
}

export async function flushBeforeUpdate(): Promise<void> {
  await Promise.all([...updateListeners].map(fn => fn()));
  await textSaves.wait();
}
