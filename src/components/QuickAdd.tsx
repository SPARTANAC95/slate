import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { parseQuickAdd } from '../lib/parse';
import { useMetadataSearch, type LookupResult } from '../lib/lookup';
import { addArtOnly, addFromResult, addParsed, addWholeSeason } from '../lib/quickAddActions';
import { useRotatingExample } from '../lib/useRotatingExample';
import { SearchDropdown } from './SearchDropdown';
import { QuickAddPreview } from './QuickAddPreview';

type Props = {
  onAdded: (date: string | null) => void;
  onNote: (text: string) => void;
};

const EXTERNAL = new Set(['film', 'series', 'game']);

export function QuickAdd({ onAdded, onNote }: Props) {
  const [value, setValue] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
    setBusy(false);
    onAdded(date);
    // the next thing to add is usually right behind this one
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /** one guarded entry point — a second Enter must not double-add a season */
  const run = async (job: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    try {
      reset(await job());
    } catch {
      setBusy(false);
      onNote('could not add that — try again');
    }
  };

  const submit = () => {
    if (!parsed?.title) return;
    run(() => addParsed(parsed));
  };

  const pick = (r: LookupResult) => {
    if (!parsed) return;
    run(async () => {
      if (r.kind === 'series' && parsed.wholeSeason !== null) {
        const bulk = await addWholeSeason(parsed, r, parsed.wholeSeason);
        if (bulk) {
          onNote(`added ${bulk.count} episodes of ${r.title} season ${parsed.wholeSeason}`);
          return bulk.date;
        }
        onNote('could not load that season — adding the show instead');
      }
      return addFromResult(parsed, r);
    });
  };

  /** the poster and nothing else — my title, my date, my kind */
  const pickArt = (r: LookupResult) => {
    if (!parsed?.title) return;
    run(async () => {
      const date = await addArtOnly(parsed, r);
      onNote(`added ${parsed.title} with ${r.title}'s cover art`);
      return date;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      // plain enter with nothing highlighted adds exactly what was typed;
      // alt+enter means "that art", so it takes the top result by default
      const index = highlight >= 0 ? highlight : e.altKey && open ? 0 : -1;
      if (index >= 0) {
        e.preventDefault();
        (e.altKey ? pickArt : pick)(results[index]);
      } else submit();
    } else if (e.key === 'Escape') {
      // one escape does one thing: the dropdown, then the text — and while
      // it is doing that, the backlog behind the box stays open
      if (open) {
        e.stopPropagation();
        clear();
        setHighlight(-1);
      } else if (value !== '') {
        e.stopPropagation();
        setValue('');
      }
    }
  };

  return (
    <div className="mb-3">
      <div className="relative">
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 transition-colors duration-150 focus-within:border-line-strong">
          <Plus size={14} className="shrink-0 text-text-3" />
          <input
            ref={inputRef}
            id="quick-add"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={example.text}
            aria-label="quick add"
            // read-only rather than disabled: a disabled field drops focus,
            // and after every add the cursor was gone from the box
            readOnly={busy}
            aria-busy={busy}
            className={`h-9 min-w-0 flex-1 bg-transparent text-13 text-text outline-none ${
              busy ? 'opacity-60' : ''
            } ${example.fading ? 'ph-fade' : ''}`}
          />
        </div>
        {open && (
          <SearchDropdown
            results={results}
            highlight={highlight}
            onPick={pick}
            onPickArt={pickArt}
            onHover={setHighlight}
          />
        )}
      </div>
      <QuickAddPreview parsed={parsed} />
    </div>
  );
}
