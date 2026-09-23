import { useEffect, useRef } from 'react';

type Handlers = {
  palette: () => void;
  quickAdd: () => void;
  /** whole months (or years in year view) */
  movePage: (delta: -1 | 1) => void;
  /** the selected day, in days */
  moveDay: (delta: number) => void;
  today: () => void;
  year: () => void;
  upcoming: () => void;
  backlog: () => void;
  help: () => void;
  /** close the topmost open surface; return true if something closed */
  escape: () => boolean;
  /**
   * A sheet is open (help, preferences, import). Only escape gets through:
   * `t` behind a modal used to move the calendar underneath it, and `n` put
   * the cursor into a box the modal was covering.
   */
  blocked: () => boolean;
};

const ARROW_DAYS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/** global keys — ctrl+k works everywhere, single letters only outside fields */
export function useShortcuts(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (e.key === 'Escape') {
        if (h.escape()) e.preventDefault();
        return;
      }
      if (h.blocked()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        h.palette();
        return;
      }

      const t = e.target as HTMLElement;
      const inField =
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable;
      if (inField || e.ctrlKey || e.altKey || e.metaKey) return;

      if (Object.hasOwn(ARROW_DAYS, e.key)) {
        e.preventDefault();
        // shift jumps a whole month; plain arrows walk days and weeks
        if (e.shiftKey) {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') h.movePage(-1);
          else h.movePage(1);
        } else {
          h.moveDay(ARROW_DAYS[e.key]);
        }
        return;
      }
      if (e.shiftKey && e.key !== '?') return;

      switch (e.key) {
        case 'n':
          e.preventDefault();
          h.quickAdd();
          break;
        case '/':
          e.preventDefault();
          h.palette();
          break;
        case 't':
          h.today();
          break;
        case 'y':
          h.year();
          break;
        case 'u':
          h.upcoming();
          break;
        case 'b':
          h.backlog();
          break;
        case '?':
          h.help();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
