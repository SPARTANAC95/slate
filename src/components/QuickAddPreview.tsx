import { CornerDownLeft } from 'lucide-react';
import { format } from 'date-fns';
import type { ParsedEntry } from '../lib/parse';
import { fromISODate } from '../lib/dates';
import { KindDot } from './KindDot';

/**
 * Live read-out of what will be created, before Enter. Fixed height so
 * the calendar below never jumps as you type.
 */
export function QuickAddPreview({ parsed }: { parsed: ParsedEntry | null }) {
  return (
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
          {parsed.wholeSeason !== null && (
            <span className="shrink-0 font-mono text-11 text-text-3">
              season {parsed.wholeSeason} — pick a show to add every episode
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
              <>
                {format(fromISODate(parsed.date), 'EEE dd.MM.yyyy').toLowerCase()}
                {parsed.time && <span className="ml-1.5 text-text">{parsed.time}</span>}
              </>
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
  );
}
