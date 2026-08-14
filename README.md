# slate

Single-user personal calendar: what's coming (game / film / series releases, events), and what I thought of it after. Local-only — data lives in the browser (IndexedDB), exportable to JSON.

## Setup

```
npm install
copy .env.example .env    # TMDB / RAWG keys, only needed from M3 on
npm run dev               # starts vite (:5173) and the API proxy (:8787)
```

Target: Chrome on desktop, ≥900px wide.

## Status

- **M1 — calendar and entries: done.** Monday-first month grid, day panel with inline entry add/edit/delete, per-day note with debounced autosave, soft delete (30-day retention), date changes append to `dateHistory`.
- M2 quick add + parsing, M3 metadata/delays, M4 countdown/backlog, M5 log/year view, M6 palette/export: not started.

## Keyboard shortcuts

Land in M6. (`n` quick add, `/` search, `←`/`→` month, `t` today, `y` year view, `Esc` close.)

## Export format

Lands in M6: a single JSON file `{ entries: Entry[], dayNotes: DayNote[] }` — see `src/types.ts`. Import merges by id, newest `updatedAt` wins.

## Tests

```
npm test    # parser (from M2) and date math
```
