import type { Entry } from '../types';
import { isToday } from '../lib/dates';
import { KindDot } from './KindDot';

type Props = {
  day: Date;
  iso: string;
  inMonth: boolean;
  entries: Entry[];
  selected: boolean;
  onSelect: (iso: string) => void;
};

const MAX_CHIPS = 3;

export function DayCell({ day, iso, inMonth, entries, selected, onSelect }: Props) {
  const today = isToday(day);
  const shown = entries.slice(0, MAX_CHIPS);
  const overflow = entries.length - shown.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(iso)}
      aria-label={iso}
      aria-pressed={selected}
      className={`flex h-full flex-col items-stretch gap-1 overflow-hidden p-2 text-left transition-colors duration-150 ${
        selected
          ? 'bg-panel-hover shadow-[inset_0_0_0_1px_rgba(255,255,255,0.13)]'
          : 'bg-bg hover:bg-panel'
      }`}
    >
      <span
        className={`self-start rounded-[5px] px-1 font-mono text-12 leading-[18px] ${
          today
            ? 'bg-panel-hover text-text outline outline-1 outline-line-strong'
            : inMonth
              ? 'text-text-2'
              : 'text-text-3'
        }`}
      >
        {day.getDate()}
      </span>

      {shown.map((e) => (
        <span
          key={e.id}
          className={`flex min-w-0 items-center gap-1.5 text-11 leading-4 ${
            inMonth ? 'text-text-2' : 'text-text-3'
          } ${e.done ? 'line-through opacity-60' : ''}`}
        >
          <KindDot kind={e.kind} />
          <span className="truncate">{e.title}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="pl-[14px] font-mono text-11 text-text-3">+{overflow} more</span>
      )}
    </button>
  );
}
