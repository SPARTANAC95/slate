# Google Calendar

## Connect on Windows

Use the cloud button in the header, or Preferences, to connect Google Calendar.
This is one-way **Slate → Google** sync. Slate remains the source of truth.

1. In Google Cloud, create a project, enable Google Calendar API, and configure
   Google Auth Platform. For personal testing, choose External and add your own
   Google account under Audience → Test users.
2. Create a **Desktop app** OAuth client and download its credentials JSON.
3. In Slate, import that JSON and click **Connect with Google**. Complete sign-in
   in your system browser, choose a writable calendar, and click **Start syncing**.

All dated entries are copied, including titles, entry notes, links, kind, and done
status. Journal day notes, ratings, verdicts, covers, and backlog entries stay local.
All-day entries use an exclusive next-day end; timed entries occupy one hour in
the computer's time zone. Annual entries become yearly Google events.

Sync runs on startup, about five seconds after local changes, every two minutes,
and when the connection comes back. Leave Slate running or in its tray; a fully
quit app cannot sync. Google copies follow Slate edits. Deleting or unscheduling
an entry in Slate removes its copy; undo/re-scheduling recreates it. Edits or
deletions made to those copies in Google are replaced from Slate on the next sync.
Other Google events are untouched and are never imported.

Pause before changing calendars. Old-calendar copies stay in place. Disconnect
forgets this device's tokens and keeps existing Google events; access can also be
revoked in your Google account settings. Google's Testing publishing status may
expire refresh tokens after seven days; use Reconnect if prompted.

OAuth uses a random loopback port, state validation, and PKCE. Credentials and
tokens live only in the native process and are encrypted for the current Windows
user in `google-account.bin` under Slate's app config directory. They are not
included in calendar exports or backups. The IndexedDB sync manifest survives
restarts; private Google event markers recover links after a backup restore.
Missing local rows never trigger remote deletion. Unsent soft deletions are
retained beyond the normal 30 days until Google acknowledges them.

The browser development build displays setup guidance; live sign-in runs in the
Windows app. `tools/google-sync-preview.html` is a simulated UI fixture available
only from the Vite development server, not part of the packaged app.

References: [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events).


[Back to the user guide](USER-GUIDE.md)
