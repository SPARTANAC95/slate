# Screenshots and repository presentation

The October 5, 2026 screenshots show Slate **0.1.2**, application source
`01fad0e8af1582994c4061f426574ddae41ec091`. That commit is published as `v0.1.2`.
Google Calendar support and the pictured Backlog actions are already in that
release; these images do not announce a new app version.

## Capture provenance

`assets/calendar.png`, `quick-add.png`, `backlog.png`, `upcoming.png`, `year.png`
and `google-calendar.png` are captured from an actual Windows Tauri/WebView2 app.
The frontend and native commands are unchanged. A build configuration gives the
capture app a separate identifier and a separate WebView profile. The images
show the web content area, without the operating-system title bar.

The original fictional entries in [sample-calendar.json](sample-calendar.json)
are shifted forward twelve days, and the frontend clock is fixed at October 5,
2026 at 10:00 UTC. The native backup restore path loads the sample into the
isolated profile. There is no simulated native backend, external artwork,
personal calendar or real OAuth account in these captures. The Google image is
the setup panel only, so unrelated settings and local backup paths are excluded.

`assets/capture.json` records the source version, capture clock and image list.
The existing `banner.svg` and `social.png` are presentation artwork, not evidence
of a running app or a Google connection.

## Reproduce on Windows

Use a disposable checkout and never point the capture tool at your daily app.
Install the normal dependencies and the optional Playwright capture dependency:

```powershell
npm ci
npm install --no-save --package-lock=false playwright
npm run tauri -- build --no-bundle --config tools/tauri-capture.conf.json -- --locked
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $env:TEMP 'slate-docs-capture-webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9346'
Start-Process -FilePath .\src-tauri\target\release\slate.exe -WindowStyle Hidden
$env:SLATE_CAPTURE_CDP = 'http://127.0.0.1:9346'
node tools/capture-native.mjs
```

With `CARGO_TARGET_DIR` configured, launch `release/slate.exe` from that directory
instead. The capture configuration starts the window hidden. WebView2 must be
running before the capture command connects. The script refuses an identifier
outside `com.slate.capture*`, existing non-demo entries or configured Google
credentials. It does not connect to Google, register autostart or install Slate.
Remove the debug environment variables before launching any other app.

Inspect every resulting image for readable controls, clipping and private
information. Verify README links, website screenshot switching, enlarged images,
keyboard controls, and narrow/mobile layout before publishing. New application
features require their own functional tests; screenshots do not validate OAuth,
remote synchronization or Windows notification delivery.

Run `node tools/check-presentation.mjs` for local links, PNG signatures, capture
version and screenshot-switcher assets. This check also runs in GitHub Actions.
