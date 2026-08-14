import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Entry } from '../types';
import { addEntry, db, restoreEntry } from '../db';
import { parseQuickAdd } from '../lib/parse';
import { fromISODate } from '../lib/dates';
import { KindDot } from './KindDot';

type Props = {
  open: boolean;
  onClose: () => void;
  entries: Entry[];
  onJump: (date: string | null) => void;
  onToggleYear: () => void;
  onExport: () => void;
  onImport: () => void;
  onShowHelp: () => void;
};

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-13 ' +
  'data-[selected=true]:bg-panel-hover';

export function CommandPalette(props: Props) {
  const { open, onClose, entries, onJump, onToggleYear, onExport, onImport, onShowHelp } = props;
  const [value, setValue] = useState('');
  const [page, setPage] = useState<'root' | 'restore'>('root');
  const deleted =
    useLiveQuery(() => db.entries.filter((e) => e.deletedAt !== null).toArray(), []) ?? [];

  useEffect(() => {
    if (!open) {
      setValue('');
      setPage('root');
    }
  }, [open]);

  if (!open) return null;

  const q = value.trim().toLowerCase();
  const parsed = q ? parseQuickAdd(value) : null;
  const matches = entries
    .filter((e) => q !== '' && e.title.toLowerCase().includes(q))
    .slice(0, 8);
  const commands = [
    { label: 'toggle year view', run: onToggleYear },
    { label: 'keyboard shortcuts', run: onShowHelp },
    { label: 'export data', run: onExport },
    { label: 'import data', run: onImport },
    {
      label: 'restore deleted',
      run: () => {
        setPage('restore');
        setValue('');
      },
      stay: true,
    },
  ].filter((c) => q === '' || c.label.includes(q));
  const pretty = (iso: string) => format(fromISODate(iso), 'EEE dd.MM.yyyy').toLowerCase();

  const finish = (fn: () => void, stay = false) => {
    fn();
    if (!stay) onClose();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/60" onMouseDown={onClose}>
      <div className="mx-auto mt-[16vh] w-[560px]" onMouseDown={(e) => e.stopPropagation()}>
        <Command
          shouldFilter={false}
          label="command palette"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              if (page === 'restore') setPage('root');
              else onClose();
            }
          }}
          className="panel-lit fade-in overflow-hidden rounded-xl border border-line bg-panel"
        >
          <Command.Input
            autoFocus
            value={value}
            onValueChange={setValue}
            placeholder={
              page === 'root' ? 'search titles, type a date, or run a command…' : 'restore which entry?'
            }
            className="h-11 w-full border-b border-line bg-transparent px-4 text-13 text-text outline-none"
          />
          <Command.List className="max-h-[340px] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-12 text-text-3">
              nothing matches
            </Command.Empty>

            {page === 'root' && parsed?.date && (
              <Command.Item className={itemClass} onSelect={() => finish(() => onJump(parsed.date))}>
                jump to <span className="font-mono text-12 text-text-2">{pretty(parsed.date)}</span>
              </Command.Item>
            )}
            {page === 'root' && matches.length > 0 && (
              <Command.Group
                heading="entries"
                className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2"
              >
                {matches.map((e) => (
                  <Command.Item
                    key={e.id}
                    className={itemClass}
                    onSelect={() => finish(() => onJump(e.date))}
                  >
                    <KindDot kind={e.kind} />
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    <span className="font-mono text-11 text-text-3">
                      {e.date ? pretty(e.date) : 'backlog'}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {page === 'root' &&
              commands.map((c) => (
                <Command.Item
                  key={c.label}
                  className={itemClass}
                  onSelect={() => finish(c.run, c.stay)}
                >
                  {c.label}
                </Command.Item>
              ))}

            {page === 'root' && parsed?.title && (
              <Command.Item
                className={itemClass}
                onSelect={() =>
                  finish(async () => {
                    await addEntry({
                      title: parsed.title,
                      kind: parsed.kind,
                      date: parsed.date,
                      annual: parsed.annual,
                      series: parsed.series,
                      tags: parsed.tags,
                    });
                    onJump(parsed.date);
                  })
                }
              >
                <KindDot kind={parsed.kind} />
                create “{parsed.title}”
                <span className="ml-auto font-mono text-11 text-text-3">
                  {parsed.date ? pretty(parsed.date) : 'backlog'}
                </span>
              </Command.Item>
            )}

            {page === 'restore' &&
              (deleted.length === 0 ? (
                <p className="px-3 py-6 text-center text-12 text-text-3">
                  nothing deleted in the last 30 days
                </p>
              ) : (
                deleted
                  .filter((e) => q === '' || e.title.toLowerCase().includes(q))
                  .map((e) => (
                    <Command.Item
                      key={e.id}
                      className={itemClass}
                      onSelect={() => finish(() => restoreEntry(e.id))}
                    >
                      <KindDot kind={e.kind} />
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <span className="text-11 text-text-3">restore</span>
                    </Command.Item>
                  ))
              ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
