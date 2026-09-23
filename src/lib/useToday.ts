import { useEffect, useState } from 'react';
import { addDays, startOfDay } from 'date-fns';
import { todayISO } from './dates';

/** ms until the next local midnight, plus a beat so the new day has really begun */
export const msUntilNextDay = (now: Date): number =>
  Math.max(1000, addDays(startOfDay(now), 1).getTime() - now.getTime() + 1000);

/**
 * Today's date as state. The tray app is a window left open across midnight,
 * and nothing in it re-rendered when the day changed: the highlighted cell,
 * the countdown numbers and the day panel's "today" all stayed on yesterday
 * until something else happened to redraw them, and the once-a-day jobs only
 * ran on open. A timer aimed at midnight fixes that; and because a hidden
 * webview's timers can be throttled or slept straight through, the day is
 * also re-read whenever the window comes back into view.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const now = todayISO();
      setToday((cur) => (cur === now ? cur : now));
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, msUntilNextDay(new Date()));
    };
    timer = setTimeout(check, msUntilNextDay(new Date()));
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('focus', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('focus', onVisible);
    };
  }, []);

  return today;
}
