import { useEffect, useState } from 'react';
import { CornerDownLeft, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { addEntry } from '../db';
import { parseQuickAdd } from '../lib/parse';
import { fromISODate } from '../lib/dates';
import { fetchCurrentDate, useMetadataSearch, type LookupResult } from '../lib/lookup';
import { useRotatingExample } from '../lib/useRotatingExample';
import { KindDot } from './KindDot';
import { SearchDropdown } from './SearchDropdown';

type Props = { onAdded: (date: string | null) => void };

const EXTERNAL = new Set(['film', 'series', 'game']);

export function QuickAdd({ onAdded }: Props) {
  const [value, setValue] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const example = useRotatingExample();
  const parsed = value.trim() ? parseQuickAdd(value) : null;

  // #film narrows the search; #task etc. disables it; otherwise search everything
  const lookupEnabled =
    !!parsed?.title && (parsed.kindSource === 'default' || EXTERNAL.has(parsed.kind));
  const kindsHint =
    parsed && parsed.kindSource !== 'default' && EXTERNAL.has(parsed.kind) ? [parsed.kind] : [];
  const { results, clear } = useMetadataSearch(parsed?.title ?? '', kindsHint, lookupEnabled);
  const open = results.length > 0;

  useEffect(() => setHighlight(-1), [results]);

  const reset = (date: string | null) => {
    setValue('');
    clear();
    setHighlight(-1);
    onAdded(date);
  };

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
    reset(parsed.date);
  };

  const pick = async (r: LookupResult) => {
    if (!parsed) return;
    // a typed date wins; otherwise the provider's — episode-precise for sNeM
    let date = parsed.date ?? r.date;
    if (!parsed.date && r.kind === 'series' && parsed.series) {
      date = await fetchCurrentDate({
        source: r.source,
        kind: 'series',
        id: r.id,
        season: parsed.series.season,
        episode: parsed.series.episode,
      });
    }
    await addEntry({
      title: r.title,
      kind: r.kind,
      date,
      annual: parsed.annual,
      series: parsed.series,
      tags: parsed.tags,
      external: { source: r.source, id: r.id, posterUrl: r.posterUrl },
      dateSource: date && !parsed.date ? 'api' : 'manual',
    });
    reset(date);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0) pick(results[highlight]);
      else submit();
    } else if (e.key === 'Escape') {
      if (open) {
        clear();
        setHighlight(-1);
      } else setValue('');
    }
  };

  return (
    <div className="mb-3">
      <div className="relative">
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 transition-colors duration-150 focus-within:border-line-strong">
          <Plus size={14} className="shrink-0 text-text-3" />
          <input
            id="quick-add"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={example.text}
            aria-label="quick add"
            className={`h-9 min-w-0 flex-1 bg-transparent text-13 text-text outline-none ${
              example.fading ? 'ph-fade' : ''
            }`}
          />
        </div>
        {open && (
          <SearchDropdown
            results={results}
            highlight={highlight}
            onPick={pick}
            onHover={setHighlight}
          />
        )}
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
