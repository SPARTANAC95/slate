import { useEffect, useRef } from 'react';

type Handlers = {
  palette: () => void;
  quickAdd: () => void;
  move: (delta: -1 | 1) => void;
  today: () => void;
  year: () => void;
  backlog: () => void;
  help: () => void;
  /** close the topmost open surface; return true if something closed */
  escape: () => boolean;
};

/** global keys — ctrl+k works everywhere, single letters only outside fields */
export function useShortcuts(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        h.palette();
        return;
      }
      if (e.key === 'Escape') {
        if (h.escape()) e.preventDefault();
        return;
      }
      const t = e.target as HTMLElement;
      const inField =
        t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      if (inField || e.ctrlKey || e.altKey || e.metaKey) return;
      switch (e.key) {
        case 'n':
        case '/':
          e.preventDefault();
          if (e.key === 'n') h.quickAdd();
          else h.palette();
          break;
        case 'ArrowLeft':
          h.move(-1);
          break;
        case 'ArrowRight':
          h.move(1);
          break;
        case 't':
          h.today();
          break;
        case 'y':
          h.year();
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
