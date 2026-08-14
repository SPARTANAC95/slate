import { useEffect, useState } from 'react';
import type { Entry } from '../types';
import { updateEntry } from '../db';

/** revealed once an entry is done: 1–5 rating squares and a one-line verdict */
export function DoneControls({ entry }: { entry: Entry }) {
  const [verdict, setVerdict] = useState(entry.verdict);
  useEffect(() => setVerdict(entry.verdict), [entry.id, entry.verdict]);

  const save = () => {
    if (verdict !== entry.verdict) updateEntry(entry.id, { verdict });
  };

  return (
    <span className="mt-1 flex items-center gap-2">
      <span className="flex gap-1" role="radiogroup" aria-label="rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={entry.rating === n}
            aria-label={`rate ${n}`}
            onClick={() => updateEntry(entry.id, { rating: entry.rating === n ? null : n })}
            className={`size-[10px] rounded-[3px] transition-colors duration-150 ${
              entry.rating !== null && n <= entry.rating
                ? 'bg-text-2'
                : 'bg-white/10 hover:bg-white/20'
            }`}
          />
        ))}
      </span>
      <input
        value={verdict}
        onChange={(e) => setVerdict(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="one-line verdict"
        aria-label={`verdict for ${entry.title}`}
        className="min-w-0 flex-1 border-b border-transparent bg-transparent text-12 text-text-2 outline-none transition-colors duration-150 placeholder:text-text-3 focus:border-line-strong"
      />
    </span>
  );
}
