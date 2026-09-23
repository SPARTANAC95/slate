import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Entry } from '../types';
import { db, restoreEntry } from '../db';
import { parseQuickAdd } from '../lib/parse';
import { addParsed } from '../lib/quickAddActions';
import { matchEntries } from '../lib/search';
import { CreateItem, EntryItems, ITEM_CLASS, JumpItem, RestoreItems } from './PaletteItems';

type Props = {
  open: boolean;
  onClose: () => void;
  entries: Entry[];
  onJump: (date: string | null) => void;
  onToggleYear: () => void;
  onToggleUpcoming: () => void;
  onExport: () => void;
  onImport: () => void;
  onShowHelp: () => void;
  onShowPreferences: () => void;
};

export function CommandPalette(props: Props) {
  const { open, onClose, entries, onJump, onToggleYear, onExport, onImport, onShowHelp } = props;
  const { onShowPreferences, onToggleUpcoming } = props;
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

  const q = value.trim();
  const parsed = q ? parseQuickAdd(value) : null;
  const matches = matchEntries(entries, q);
  const commands = [
    { label: 'upcoming — countdowns for everything', run: onToggleUpcoming },
    { label: 'toggle year view', run: onToggleYear },
    { label: 'preferences — api keys, reminders', run: onShowPreferences },
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
  ].filter((c) => q === '' || c.label.includes(q.toLowerCase()));

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
              page === 'root'
                ? 'search titles and #tags, type a date, or run a command…'
                : 'restore which entry?'
            }
            className="h-11 w-full border-b border-line bg-transparent px-4 text-13 text-text outline-none"
          />
          <Command.List className="max-h-[340px] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-12 text-text-3">
              nothing matches
            </Command.Empty>

            {page === 'root' ? (
              <>
                {parsed?.date && (
                  <JumpItem date={parsed.date} onSelect={() => finish(() => onJump(parsed.date))} />
                )}
                <EntryItems entries={matches} onSelect={(e) => finish(() => onJump(e.date))} />
                {commands.map((c) => (
                  <Command.Item
                    key={c.label}
                    className={ITEM_CLASS}
                    onSelect={() => finish(c.run, c.stay)}
                  >
                    {c.label}
                  </Command.Item>
                ))}
                {parsed?.title && (
                  <CreateItem
                    parsed={parsed}
                    // the same add quick add does, so a typed hour is not
                    // dropped on the floor here and kept there
                    onSelect={() => finish(() => addParsed(parsed).then(onJump))}
                  />
                )}
              </>
            ) : (
              <RestoreItems
                deleted={q === '' ? deleted : matchEntries(deleted, q)}
                onSelect={(e) => finish(() => restoreEntry(e.id))}
              />
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
