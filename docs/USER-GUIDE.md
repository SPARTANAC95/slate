# Using Slate

[Download](https://github.com/SPARTANAC95/slate/releases/latest) · [Website](https://spartanac95.github.io/slate/) · [Repository](../README.md)

## Install and open

Download the Windows x64 setup file from Releases, run it, and launch Slate from your Start menu. The unsigned installer may show an unknown-publisher warning. The release provides a SHA-256 checksum you can compare with `Get-FileHash .\Slate_0.1.0_x64-setup.exe -Algorithm SHA256` in PowerShell.

Start with one entry. No account or API key is needed for manual planning. Slate is designed for a desktop window at least 900 pixels wide.

## Add something

Click the quick-add field, or press **N**, and type a title with an optional date, time, and kind. Read the preview, then press **Enter**.

| Input | Meaning |
| --- | --- |
| `#event cinema tomorrow 20:00` | An event tomorrow at 20:00 |
| `#task book tickets in 3 days` | A task three days from now |
| `#film The Glass Harbour` | An undated film in the backlog |
| `anniversary 4.7. every year` | An annual entry on July 4 |
| `#event dinner petak 19:00` | An event on Friday at 19:00 |

Kinds are `#game`, `#film`, `#series`, `#event`, `#task`, and `#note`. Other hashtags become searchable tags. Use `s3e4` for an episode or `s3` when looking up a whole season. With a configured provider, choosing a whole-season result adds its dated episodes.

You can also click a day and choose **add entry** for the full editor. It includes notes, links, a time, and kind-specific fields.

## Plan a day or a month

Click a day to see its entries and daily note in the side panel. Click an entry title to edit it. The countdown rail shows the nearest unfinished entries; click one to jump to its date.

Open **backlog** to see undated ideas. Drag one onto a calendar day or edit its date. **Pick for me** offers a suggestion based on kind and the time you have; you can reroll or schedule the result.

Open **upcoming** for a chronological list with countdowns. Open **year** for an overview of scheduled and completed activity.

## Find releases and covers

For the Windows app, press **Ctrl+K**, select **preferences**, and enter your optional keys:

- **TMDB:** films, series, episodes, posters, and runtimes. Obtain a key or read-access token from your TMDB account's API settings.
- **IGDB:** a Twitch application client ID and secret for games. Steam lookup is available as a fallback without a key.

Use **Test keys** to check a connection. Searching needs internet access. Without keys or a working provider, you can still add entries manually.

When selecting a result, a date you already typed takes priority. **Keep my date** pins a personal date so future release refreshes cannot move it. Unpin it to follow the provider. The refresh control checks linked entries and records date changes.

Use **Alt+Enter** on a search result to take only its cover art. Existing entries have **find cover art** in their editor.

## Remember what you enjoyed

An entry dated today or earlier can be marked **done**. Add a rating from one to five and a short verdict. Click a selected rating again to clear it. Daily notes are separate from individual entries and autosave as you write.

## Reminders and the tray

Enable reminders in **preferences**. Slate can show a morning list from 08:00 and a reminder 30 minutes before timed entries. **Test notification** checks the Windows notification path. Windows notification and Focus settings may suppress toasts.

Closing the window hides Slate to the tray. Right-click the tray icon and select **Quit** to stop the app. Reminders, metadata refresh, and Google sync need a running app; they cannot run after a full quit or while the computer is off. Start-with-Windows is optional in preferences.

## Data and backups

Your working calendar is stored locally in IndexedDB. In the Windows app, a JSON backup and history are kept under Slate's application data directory (`com.slate.app` beneath the Windows roaming application-data location). Browser development writes its mirror to the project's ignored `data/` folder.

The backup indicator reports whether the mirror succeeded. If it is unavailable, export a copy and check local disk access. History keeps recent versions plus daily snapshots according to the retention policy; it is not unlimited storage and does not protect against losing the whole disk.

**To export:** press **Ctrl+K → export data**. The Windows app writes into Downloads and opens the location. Keep a copy somewhere separate from the computer for an independent backup.

**To import:** choose **Ctrl+K → import data**, select a Slate JSON export, inspect the additions and updates, then choose **Import**. Matching entries merge by ID and newer `updatedAt`. Importing does not replace the entire database. An automatic disk backup uses the same import format. Empty profiles may be offered a restore from an existing disk backup.

**To recover a deletion:** use **Ctrl+K → restore deleted**. Entries normally remain recoverable for 30 days. Unsent Google deletions can be retained longer until acknowledged by Google.

Exports include calendar entries and day notes, including retained soft deletions. They do not contain API keys or Google OAuth tokens. Treat exports as personal documents. Local backup JSON and metadata API keys are not an encrypted vault; Windows Google credentials use per-user DPAPI encryption.

## Optional Google Calendar connection

Google integration is **one-way from Slate to Google** and requires your own Desktop OAuth client. It is available in the Windows app. Follow the [Google Calendar setup guide](GOOGLE-CALENDAR.md).

Sync copies dated entry titles, notes, links, kind, and done status to your selected Google calendar. Day journals, ratings, verdicts, cover art, and undated backlog entries stay local. Slate remains the source of truth: Google-side edits to Slate-created copies are overwritten at the next sync.

Disconnecting removes this device's connection but leaves existing Google events in place. Other Google events are not imported.

## Keyboard reference

| Shortcut | Action |
| --- | --- |
| Ctrl+K or / | Command palette / search |
| N | Quick add |
| Alt+Enter | Use a lookup result's artwork only |
| Left / Right | Previous / next day |
| Up / Down | Previous / next week |
| Shift+Left / Shift+Right | Previous / next month, or year in year view |
| T | Today |
| B | Backlog |
| U | Upcoming |
| Y | Year view |
| ? | Shortcut sheet |
| Escape | Close the current overlay |

## Try the sample calendar

[Download the fictional sample data](sample-calendar.json), then import it using the steps above. It contains September/October 2026 examples. Because importing merges entries, try it in a separate browser development profile if you do not want examples mixed into your own calendar.

## Troubleshooting

- **No search results:** check connectivity and optional provider keys, or enter the title/date manually.
- **No notification:** use Test notification, check Windows settings, and keep Slate running.
- **Blank calendar after changing profiles:** look for the disk-restore offer or import your latest export.
- **Google needs reconnecting:** reconnect in preferences. Google OAuth projects in Testing may have short-lived refresh authorization; see the setup guide.
- **Something else:** [report the steps to reproduce](https://github.com/SPARTANAC95/slate/issues). Remove private notes, API keys, and credentials from attachments.