import { useState } from 'react';
import { CornerDownLeft, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { addEntry } from '../db';
import { parseQuickAdd } from '../lib/parse';
import { fromISODate } from '../lib/dates';
import { KindDot } from './KindDot';

type Props = { onAdded: (date: string | null) => void };

export function QuickAdd({ onAdded }: Props) {
  const [value, setValue] = useState('');
  const parsed = value.trim() ? parseQuickAdd(value) : null;

  const submit = async () => {
    if (!parsed?.title) return;
    await addEntry({
      title: parsed.title,
      kind: parsed.kind,
      date: parsed.date,
      annual: parsed.annual,
      series: parsed.series,
      tags: parsed.tags,
    });
    setValue('');
    onAdded(parsed.date);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 transition-colors duration-150 focus-within:border-line-strong">
        <Plus size={14} className="shrink-0 text-text-3" />
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setValue('');
          }}
          placeholder="Silo s3e4 tomorrow · GTA 6 19.11. · dentist in 3 days · #film Dune dec 18"
          aria-label="quick add"
          className="h-9 min-w-0 flex-1 bg-transparent text-13 text-text outline-none"
        />
      </div>
      {/* fixed-height preview strip so the grid never jumps */}
      <div className="flex h-7 items-center gap-2 px-3 pt-1">
        {parsed && (
          <>
            <KindDot kind={parsed.kind} />
            <span className="min-w-0 truncate text-12 text-text-2">
              {parsed.title || <span className="text-text-3">title missing</span>}
            </span>
            {parsed.series && (
              <span className="shrink-0 font-mono text-11 text-text-3">
                s{parsed.series.season}e{parsed.series.episode}
              </span>
            )}
            {parsed.annual && <span className="shrink-0 text-11 text-text-3">every year</span>}
            {parsed.tags.map((t) => (
              <span key={t} className="shrink-0 text-11 text-text-3">
                #{t}
              </span>
            ))}
            <span className="ml-auto shrink-0 font-mono text-12 text-text-2">
              {parsed.date ? (
                format(fromISODate(parsed.date), 'EEE dd.MM.yyyy').toLowerCase()
              ) : (
                <span className="text-text-3">no date — goes to backlog</span>
              )}
            </span>
            {parsed.title && (
              <span className="flex shrink-0 items-center gap-1 text-11 text-text-3">
                <CornerDownLeft size={11} />
                add
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
