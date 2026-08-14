import { useMemo, useState } from 'react';
import type { Entry } from '../types';
import { monthName } from '../lib/dates';

type Props = {
  entries: Entry[];
  year: number;
  onJumpToDay: (iso: string) => void;
};

type Tip = { iso: string; titles: string[]; x: number; y: number };

const INTENSITY = ['bg-white/[0.045]', 'bg-white/20', 'bg-white/40', 'bg-white/65'];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function YearView({ entries, year, onJumpToDay }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);

  // logged = marked done on that day
  const logged = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of entries) {
      if (!e.done || e.date === null || !e.date.startsWith(`${year}-`)) continue;
      map.set(e.date, [...(map.get(e.date) ?? []), e.title]);
    }
    return map;
  }, [entries, year]);

  const total = [...logged.values()].reduce((n, t) => n + t.length, 0);

  const show = (el: HTMLElement, dayISO: string, titles: string[]) => {
    const r = el.getBoundingClientRect();
    setTip({ iso: dayISO, titles, x: r.left + r.width / 2, y: r.top });
  };

  return (
    <div className="fade-in flex min-h-0 flex-1 flex-col px-1">
      <p className="mb-4 text-center font-mono text-12 text-text-3">
        {total} logged
      </p>
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="m-auto flex gap-6 pb-4">
          {Array.from({ length: 12 }, (_, m) => {
          const daysInMonth = new Date(year, m + 1, 0).getDate();
          return (
            <div key={m} className="flex flex-col items-center gap-2">
              <div className="section-label">{monthName(m).slice(0, 3)}</div>
              <div className="flex flex-col gap-[3px]">
                {Array.from({ length: daysInMonth }, (_, d) => {
                  const dayISO = iso(year, m, d + 1);
                  const titles = logged.get(dayISO) ?? [];
                  const level = Math.min(titles.length, 3);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-label={`${dayISO}${titles.length ? ` — ${titles.length} logged` : ''}`}
                      onClick={() => onJumpToDay(dayISO)}
                      onMouseEnter={(e) => show(e.currentTarget, dayISO, titles)}
                      onMouseLeave={() => setTip(null)}
                      onFocus={(e) => show(e.currentTarget, dayISO, titles)}
                      onBlur={() => setTip(null)}
                      className={`size-(--size-square) rounded-[3px] transition-colors duration-150 ${INTENSITY[level]} ${
                        level === 0 ? 'hover:bg-white/15' : 'hover:bg-white/80'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
      </div>
      {tip && (
        <div
          className="panel-lit pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel px-2.5 py-1.5 whitespace-nowrap"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          <div className="font-mono text-11 text-text-3">{tip.iso}</div>
          {tip.titles.length > 0 ? (
            tip.titles.map((t) => (
              <div key={t} className="text-12 text-text">
                {t}
              </div>
            ))
          ) : (
            <div className="text-12 text-text-3">nothing logged</div>
          )}
        </div>
      )}
    </div>
  );
}
