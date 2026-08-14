import { useEffect, useRef, useState } from 'react';

type Options = {
  /** the stored text; undefined while it is still loading */
  stored: string | undefined;
  /** changing this re-seeds the field (a different day, a different entry) */
  resetKey: string;
  save: (text: string) => void;
  delay?: number;
};

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
  const pending = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (stored === undefined) return;
    if (seededFor.current !== resetKey) {
      seededFor.current = resetKey;
      setValue(stored);
    }
  }, [stored, resetKey]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      saveRef.current(pending.current);
      pending.current = null;
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const onChange = (next: string) => {
    setValue(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), delay);
  };

  // commit before the window can go away — hiding to tray, quitting, reload
  useEffect(() => {
    const onHide = () => flushRef.current();
    addEventListener('pagehide', onHide);
    addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      removeEventListener('pagehide', onHide);
      removeEventListener('beforeunload', onHide);
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
