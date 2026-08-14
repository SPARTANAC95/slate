import { saveDayNote } from '../db';
import { useDayNote } from '../db/hooks';
import { useAutosaveText } from '../lib/useAutosaveText';

/** the day's journal note; saves itself while you type and before the window goes */
export function DayNoteBox({ date }: { date: string }) {
  const loaded = useDayNote(date); // undefined = still loading
  const stored = loaded && loaded.forDate === date ? (loaded.note?.body ?? '') : undefined;

  const note = useAutosaveText({
    stored,
    resetKey: date,
    save: (body) => saveDayNote(date, body),
  });

  return (
    <textarea
      value={note.value}
      onChange={(e) => note.onChange(e.target.value)}
      onBlur={note.flush}
      placeholder="notes for this day"
      className="min-h-[120px] w-full flex-1 resize-none rounded-lg border border-line bg-transparent p-2.5 text-13 leading-relaxed text-text transition-colors duration-150 focus:border-line-strong focus:outline-none"
    />
  );
}
