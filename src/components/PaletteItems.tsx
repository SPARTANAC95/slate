import { Command } from 'cmdk';
import { format } from 'date-fns';
import type { Entry } from '../types';
import type { ParsedEntry } from '../lib/parse';
import { fromISODate } from '../lib/dates';
import { KindDot } from './KindDot';

export const ITEM_CLASS =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-13 ' +
  'data-[selected=true]:bg-panel-hover';

export const GROUP_CLASS =
  '[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-2.5 ' +
  '[&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2';

export const pretty = (iso: string) =>
  format(fromISODate(iso), 'EEE dd.MM.yyyy').toLowerCase();

export function JumpItem({ date, onSelect }: { date: string; onSelect: () => void }) {
  return (
    <Command.Item className={ITEM_CLASS} onSelect={onSelect}>
      jump to <span className="font-mono text-12 text-text-2">{pretty(date)}</span>
    </Command.Item>
  );
}

export function EntryItems({
  entries,
  onSelect,
}: {
  entries: Entry[];
  onSelect: (e: Entry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <Command.Group heading="entries" className={GROUP_CLASS}>
      {entries.map((e) => (
        <Command.Item key={e.id} className={ITEM_CLASS} onSelect={() => onSelect(e)}>
          <KindDot kind={e.kind} />
          <span className="min-w-0 flex-1 truncate">{e.title}</span>
          {e.tags.map((t) => (
            <span key={t} className="shrink-0 text-11 text-text-3">
              #{t}
            </span>
          ))}
          <span className="shrink-0 font-mono text-11 text-text-3">
            {e.date ? pretty(e.date) : 'backlog'}
          </span>
        </Command.Item>
      ))}
    </Command.Group>
  );
}

export function CreateItem({ parsed, onSelect }: { parsed: ParsedEntry; onSelect: () => void }) {
  return (
    <Command.Item className={ITEM_CLASS} onSelect={onSelect}>
      <KindDot kind={parsed.kind} />
      create “{parsed.title}”
      <span className="ml-auto font-mono text-11 text-text-3">
        {parsed.date ? pretty(parsed.date) : 'backlog'}
      </span>
    </Command.Item>
  );
}

export function RestoreItems({
  deleted,
  onSelect,
}: {
  deleted: Entry[];
  onSelect: (e: Entry) => void;
}) {
  if (deleted.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-12 text-text-3">
        nothing to restore — deletes are kept for 30 days
      </p>
    );
  }
  return (
    <>
      {deleted.map((e) => (
        <Command.Item key={e.id} className={ITEM_CLASS} onSelect={() => onSelect(e)}>
          <KindDot kind={e.kind} />
          <span className="min-w-0 flex-1 truncate">{e.title}</span>
          <span className="text-11 text-text-3">restore</span>
        </Command.Item>
      ))}
    </>
  );
}
