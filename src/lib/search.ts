import type { Entry } from '../types';

/**
 * Match entries by title and by tag. A `#tag` term matches tags only;
 * bare words match either, so `#game elden` narrows by both.
 */
export function matchEntries(entries: Entry[], query: string, limit = 8): Entry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return entries
    .filter((e) => {
      const title = e.title.toLowerCase();
      const tags = e.tags.map((t) => t.toLowerCase());
      return terms.every((term) => {
        if (term.startsWith('#')) {
          const want = term.slice(1);
          return want !== '' && tags.some((t) => t.startsWith(want));
        }
        return title.includes(term) || tags.some((t) => t.startsWith(term));
      });
    })
    .slice(0, limit);
}
