import { useEffect, useRef, useState } from 'react';
import { saveDayNote } from '../db';
import { useDayNote } from '../db/hooks';

/** textarea for the day's journal note; autosaves 500ms after typing stops and on blur */
export function DayNoteBox({ date }: { date: string }) {
  const loaded = useDayNote(date); // undefined = loading
  const [body, setBody] = useState('');
  const initializedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ date: string; body: string } | null>(null);

  useEffect(() => {
    // ignore results that belong to a previously selected day
    if (loaded === undefined || loaded.forDate !== date) return;
    if (initializedFor.current !== date) {
      initializedFor.current = date;
      setBody(loaded.note?.body ?? '');
    }
  }, [date, loaded]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) {
      saveDayNote(pending.current.date, pending.current.body);
      pending.current = null;
    }
  };

  // if the day changes (or the panel unmounts) mid-debounce, save what was typed
  useEffect(() => flush, [date]);

  const onChange = (value: string) => {
    setBody(value);
    pending.current = { date, body: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };

  return (
    <textarea
      value={body}
      onChange={(e) => onChange(e.target.value)}
      onBlur={flush}
      placeholder="how was this day…"
      className="min-h-[120px] w-full flex-1 resize-none rounded-lg border border-line bg-transparent p-2.5 text-13 leading-relaxed text-text transition-colors duration-150 focus:border-line-strong focus:outline-none"
    />
  );
}
