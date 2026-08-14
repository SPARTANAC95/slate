import type { EntryKind } from '../types';

const DOT_CLASS: Record<EntryKind, string> = {
  game: 'bg-kind-game',
  film: 'bg-kind-film',
  series: 'bg-kind-series',
  event: 'bg-kind-event',
  task: 'bg-kind-task',
  note: 'bg-kind-note',
};

export function KindDot({ kind }: { kind: EntryKind }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-[6px] shrink-0 rounded-full ${DOT_CLASS[kind]}`}
    />
  );
}
