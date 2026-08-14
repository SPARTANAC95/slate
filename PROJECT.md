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
- User (2026-08-14): "make sure everything syncs and saves on device" → persistent-storage request + automatic on-disk backup (`data/slate-backup.json`, rotated history) via the local proxy. No cloud sync — cross-machine moves stay export/import (M6).
- User (2026-08-14): entries can carry links ("check out the trailer") → `links: string[]` on Entry (Dexie v2 migration), quiet external-link icons in the row; entry `notes` exposed in the editor and shown as a second line.

- Windows is the target platform (user, 2026-08-14): `ctrl k` chords, Windows-styled thin scrollbars, keys shown as `ctrl` in the help sheet. Example copy kept professional/media-focused per user note.
- "Always-focused quick add" (M2 spec) conflicts with single-letter shortcuts (M6): shortcuts won. The input is focused once on open and via `n`; autoFocus on remount would swallow arrows/letters after a view switch.

## Next actions

- All six milestones delivered. Remaining for the user: create TMDB + RAWG keys → `.env` (README) — until then lookup silently returns nothing.
- Possible follow-up if asked: package as a real Windows desktop app (Tauri would fit — small, no Chrome dependency) and/or a `start-slate.cmd` launcher.


