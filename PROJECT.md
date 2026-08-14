# slate

- **Project ID:** `slate`
- **Owner:** claude
- **Status:** active
- **Created:** 2026-08-14
- **Updated:** 2026-08-14

## Purpose

Single-user personal calendar for tracking upcoming releases (games, films, series, events) and logging verdicts after the fact. Vite + React 18 + TS, Dexie, local-only.

## Structure

- `src/types.ts` — data model (`Entry`, `DayNote`); everything derives from it.
- `src/db/` — the only module that touches Dexie/IndexedDB; enforces dateHistory append-on-change and 30-day soft delete.
- `src/lib/dates.ts` — date math (Monday-first month grid, annual recurrence); unit-tested.
- `src/components/` — hand-built primitives, no component library; keep each under ~150 lines.
- `server/` — Express proxy so TMDB/RAWG keys stay out of the client bundle (routes land in M3).

## Commands

- `npm run dev` — vite (:5173) + proxy (:8787) together.
- `npm test` — vitest (date math; parser from M2).
- `npm run build` — typecheck + production build.

## Decisions

- Design follows the build prompt exactly: cursor.com-style dark restraint, all numbers monospace, kind dots are the only saturated color. User confirmed direction with an Audeze HQ screenshot (2026-08-14).
- User emphasis (2026-08-14): the app is also a *reminder* surface — "I should check out this series today" — so upcoming things must be visible without digging (countdown rail in M4, today-first). Motion should feel premium and satisfying: polished, orchestrated, still within the 120–160ms ease-out restraint of the spec.
- `useLiveQuery` results get tagged with the key they were queried for (see `useDayNote`) — on a key switch the hook briefly reports the previous result, which otherwise corrupts local editing state.
- Milestones are committed one at a time; each must be seen running before the next starts.

## Next actions

- M2 — quick add with date parsing (EN + BS date words), live parse preview, parser unit tests.


