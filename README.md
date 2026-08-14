# slate

Single-user personal calendar: what's coming (game / film / series releases, events), and what I thought of it after. Local-only — data lives in the browser (IndexedDB), exportable to JSON.

slate runs two ways from one codebase:

- **Windows app** (recommended) — its own window, taskbar icon, tray, and toast reminders. No terminal, no browser.
- **Browser + dev server** — for development.

## Launching it

Double-click **Slate** on the Desktop, or search "Slate" in the Start Menu — right-click it there to pin it to the taskbar. `slate.cmd` in this folder does the same from a terminal, and builds the app first if it has never been built.

To recreate the shortcuts on a new machine, or after moving the project:

```
powershell -File tools/New-Shortcuts.ps1
powershell -File tools/New-Shortcuts.ps1 -Remove   # undo
```

There is also a real installer at `src-tauri/target/release/bundle/nsis/Slate_0.1.0_x64-setup.exe` if you would rather install it properly — that adds a Windows uninstall entry.

## Building the Windows app

```
npm install
npm run dev:app      # run with hot reload
npm run build:app    # rebuild the exe and the installer
```

Needs Rust (`rustup`) and the MSVC build tools. API keys go in the app itself: `ctrl k` → `preferences`.

## Setup — browser

```
npm install
copy .env.example .env    # TMDB / RAWG keys
npm run dev               # vite (:5173) + API proxy (:8787)
```

Target: Chrome on desktop, ≥900px wide.

## Status

- **M1 — calendar and entries: done.** Monday-first month grid, day panel with inline entry add/edit/delete (incl. links and notes per entry), per-day note with debounced autosave, soft delete (30-day retention), date changes append to `dateHistory`.
- **On-device safety:** the app requests persistent storage (no browser eviction) and mirrors the whole database to `data/slate-backup.json` on every change (2s debounce + a beacon on tab close) while the dev server runs. Previous versions rotate into `data/history/` (last 20), so an empty browser profile can never destroy the only good backup. The file uses the same shape the M6 export/import will use.
- **M2 — quick add with date parsing: done.** One line at the top parses title, kind, date, series (`s3e4`), `every year`, and `#kind`/`#tag` tags from anywhere in the string, with a live preview before Enter. Understands `tomorrow/sutra/danas/veceras/prekosutra`, weekdays in English and Bosnian (`friday`/`petak`), `19.11.` (rolls to the next year that hasn't passed), `dec 18 2026`/`18 dec`, `in 3 days`/`za 3 dana` (implies task), ISO dates. No date → backlog, and the preview says so. Adding a dated entry jumps the view to it. Parser is fully unit-tested.
- **M3 — metadata lookup and delay tracking: done.** Typing in quick add searches TMDB (films, series) and RAWG (games) through the proxy, 300ms debounced, up to 5 results with year and poster; arrow keys + Enter to pick. Picking fills title, kind, date, and poster; a typed date always wins, and `sNeM` series pull the exact episode air date. `Refresh dates` (header) re-checks every non-done API-linked entry — automatically once per day on open. A moved date appends to `dateHistory` and the row shows the trail: original struck through, every later date, `delayed 2×, 208 days total`. No keys / dead network degrades silently to manual entry.
- **M4 — countdown rail and backlog: done.** The rail above the grid shows the next 6 dated entries as big monospace day counts (`TODAY` and `TOMORROW` are words); past-but-not-done entries sit at the front on an elevated card with a negative count. Clicking a card jumps to its day. The `backlog N` toggle (header, left) opens a column of everything undated — drag a row onto any day cell to schedule it, or edit it inline for the keyboard path. `Pick for me` rolls a die over the backlog filtered by kind and rough time (`~30min` → series/task/note, `an evening` → film/series, `a weekend` → game), with re-roll and one-click `Schedule today`/`tomorrow`.
- **M5 — the log: done.** Entries whose date has passed get a `Mark done` action in the row; done reveals five rating squares (click again to clear) and a one-line verdict that saves on blur or Enter. The `year` toggle shows twelve columns of day squares, intensity by how much was logged that day, monochrome; hover shows the day's titles, click jumps to the day. Squares scale up on 2K/4K screens.
- **M6 — command palette, data, polish: done.** `ctrl k` opens the palette: search titles, type a date to jump (`19.11.`, `friday`, `sutra` all work), create entries, toggle year view, export, import, restore deleted (30-day window). Keyboard shortcuts throughout, with a `?` sheet. Export downloads one JSON file; import shows a diff summary (`+N new · M updated · K unchanged`, newest `updatedAt` wins) before committing. Thin dark scrollbars for Windows Chrome.

## Saving

There is no save button anywhere, and nothing is ever staged. Adding, editing, scheduling, deleting, rating and marking done write to the database the moment you act. The two free-text fields — the day note and the one-line verdict — commit 500ms after you stop typing, and also on blur, on switching day or entry, and whenever the window is hidden or closed, so quitting to the tray mid-sentence keeps what you wrote.

On top of that the whole database is mirrored to a JSON file on disk two seconds after any change, with the previous twenty versions kept beside it.

## Reminders

The desktop app nudges you once a day about whatever is scheduled, as a Windows toast. Closing the window leaves slate in the tray so the reminder still arrives; quit properly from the tray menu. Turn reminders off, or enable start-with-Windows, in `ctrl k` → `preferences`.

## API keys

Both are free. In the desktop app they live in `ctrl k` → `preferences`. In the browser they go in `.env` (copy `.env.example`), then restart `npm run dev`:

- `TMDB_API_KEY` — create an account at themoviedb.org → Settings → API. Either the classic v3 key or the "API Read Access Token" works.
- `RAWG_API_KEY` — register at rawg.io/apidocs. Free tier: 20,000 requests/month (the proxy caches for an hour to stay well under).

Without keys the app works fully — you just type dates yourself.

This product uses the TMDB API but is not endorsed or certified by TMDB. Game data by RAWG.

## Keyboard shortcuts

| key | action |
|---|---|
| `ctrl k` | command palette |
| `n` | focus quick add |
| `/` | search (palette) |
| `←` `→` | previous / next day |
| `↑` `↓` | previous / next week |
| `shift` `←` `→` | previous / next month (year in year view) |
| `t` | today |
| `y` | year view |
| `b` | backlog |
| `?` | shortcut sheet |
| `esc` | close whatever is open |

## Export format

One JSON file: `{ version: 1, exportedAt, entries: Entry[], dayNotes: DayNote[] }` — field shapes in `src/types.ts`. The automatic on-disk backup (`data/slate-backup.json`) uses the identical shape, so a backup is also a valid import. Import merges by id; for each id the newer `updatedAt` wins, and a diff summary is shown before anything is written.

## Tests

```
npm test    # 78 tests: parser, date math, rail order, search, runtime, import normalization
```

## Beyond the original six milestones

- **Poster art** on entry rows and countdown cards, from whichever provider matched.
- **Tags** render on entries and are searchable in the palette (`#hype`, or `#scifi dune` to narrow by both).
- **Whole-season add** — type `Silo s3` (no episode), pick the show, and every dated episode of that season is added at once with its own air date and runtime.
- **Real runtimes** — `Pick for me` filters by actual TMDB runtime / RAWG playtime instead of guessing from kind, and rows show the length.
- **Full keyboard reach** — arrows walk days and weeks across month boundaries, shift+arrows jump months.
- **Year view shows scheduled entries too**, dimmer than logged ones, so an unlogged year is not an empty grid.
- **Backup status** in the header — if the disk mirror is not running, it says so instead of failing silently.
- **Error boundary** — a render crash offers an export rather than a white screen.
