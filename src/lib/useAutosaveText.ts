import { useEffect, useRef, useState } from 'react';
import { onBeforeUpdate, onWindowGoingAway } from './lifecycle';
import { textSaves } from './textSaveQueue';

type Options = {
  /** the stored text; undefined while it is still loading */
  stored: string | undefined;
  /** changing this re-seeds the field (a different day, a different entry) */
  resetKey: string;
  save: (text: string) => void | Promise<unknown>;
  delay?: number;
};

/** uncommitted text, carrying the save that belongs to it */
type Pending = { key: string; text: string; save: (text: string) => void | Promise<unknown> };

/**
 * A text field that saves itself: `delay` ms after typing stops, on blur, and
 * whenever the window is hidden or closed. Nothing here has a save button, so
 * a keystroke that was never committed is a keystroke that was lost — and in
 * the tray app the window can vanish at any moment.
 */
export function useAutosaveText({ stored, resetKey, save, delay = 500 }: Options) {
  const [value, setValue] = useState('');
  const seededFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(() => {
    if (stored === undefined) return;
    // Imports and restores can change the current day's note (or verdict)
    // without changing its key. Reflect that update when we have no unsaved
    // typing, while keeping an active draft intact.
    if (seededFor.current !== resetKey || pending.current === null) {
      seededFor.current = resetKey;
      setValue(stored);
    }
  }, [stored, resetKey]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      const task = pending.current;
      pending.current = null;
      textSaves.enqueue(task.key, () => task.save(task.text));
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => onBeforeUpdate(async () => {
    flushRef.current();
  }), []);

  const onChange = (next: string) => {
    setValue(next);
    // Capture the save alongside the text, now, while it still points at the
    // day or entry this was typed under. Reaching for the newest save at flush
    // time would file half-typed text against whatever you had just switched
    // to — the parent re-renders with a save aimed at the new target before
    // this hook's cleanup gets to run.
    pending.current = { key: resetKey, text: next, save };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), delay);
  };

  // commit before the window can go away — hiding to tray, quitting, reload
  useEffect(() => {
    const onHide = () => flushRef.current();
    const stop = onWindowGoingAway(onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  // switching day or entry must not carry typing over to the next one
  useEffect(
    () => () => {
      flushRef.current();
      pending.current = null;
    },
    [resetKey],
  );

  return { value, onChange, flush };
}
