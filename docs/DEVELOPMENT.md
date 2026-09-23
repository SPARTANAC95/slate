# Developing Slate

## Requirements

- Node.js **22.12 or newer** and npm. CI uses Node 22.
- For the native app: Windows x64, Rust stable with the MSVC toolchain, Microsoft C++ Build Tools with Desktop development with C++, and Microsoft Edge WebView2. See [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).

## Local browser development

```sh
git clone https://github.com/SPARTANAC95/slate.git
cd slate
npm ci
npm run dev
```

Vite serves the UI on port 5173; the Express API binds to `127.0.0.1:8787`. Keep both local. This development server is not an authenticated hosted service.

For metadata, copy `.env.example` to `.env`, fill in your own optional credentials, and restart the dev server. Never use a `VITE_` variable for a secret: those are exposed to browser bundles.

`npm run dev:web` serves only the frontend. Without an API, metadata lookup and disk backup will be unavailable. `npm run preview` previews the built frontend and does not start an API.

## Windows development and packaging

```sh
npm run dev:app
npm run build:app
```

Quit Slate from its tray menu before rebuilding, since a running executable can lock the build output. The native app uses Rust commands instead of Express and stores provider keys through Preferences.

Build output:

```text
src-tauri/target/release/slate.exe
src-tauri/target/release/bundle/nsis/Slate_0.1.0_x64-setup.exe
```

The installer is currently unsigned. `slate.cmd` launches a local release build, building it first when missing. `tools/New-Shortcuts.ps1` creates local development shortcuts; the installer creates the normal installed-app entry.

## Checks

```sh
npm test
npm run build
npm audit --audit-level=moderate
cd src-tauri
cargo test --locked --lib
```

GitHub Actions runs the web checks on Linux and native tests plus NSIS packaging on Windows. It stores the installer as a workflow artifact. Public Releases are curated separately; a successful workflow does not automatically publish a release.

Before a release, also exercise quick add, import/export, reload persistence, backlog scheduling, notes/verdicts, and tray behavior. Provider sign-in and real Windows notifications need their own runtime checks; passing unit tests does not certify those external services.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/components/` | Calendar, entry editor, upcoming/year views, preferences |
| `src/db/` | Dexie schema, imports, backups, provider refresh, Google sync queue |
| `src/lib/` | Date/parser logic, reminders, native bridge, shared hooks |
| `server/` | Local browser API: metadata and rotating disk backups |
| `src-tauri/src/` | Native application, metadata, OAuth, Windows tray and persistence |
| `docs/` | Static GitHub Pages website, guides, fictional sample data, screenshots |
| `tools/` | Windows development helpers and isolated Google UI fixture |

The platform seam is `src/lib/platform.ts`: browser builds use `/api`, while desktop builds invoke Tauri commands. Keep Node/Rust metadata behavior and backup rotation consistent. Preserve the `com.slate.app` application identifier to retain existing users' data locations.

## Documentation and screenshots

The Pages site is plain HTML/CSS/JavaScript in `docs/`, with no build step or third-party tracking. GitHub Pages publishes the `/docs` folder of `main`.

Screenshots use `docs/sample-calendar.json`, a separate browser profile, a fixed September 23, 2026 clock, and mocked local backup/metadata endpoints. They show the real shared UI, not the native title bar. Never take documentation screenshots from a personal account. Keep images in `docs/assets/`, and update alt text when changing them.

For an isolated UI fixture of Google connection states, open `/tools/google-sync-preview.html` through Vite. It is not included in the production build. The optional PowerShell Google recovery helper operates on an existing local account file; ordinary users should connect through Preferences.

## Source policy

Slate's source is public for inspection, but no open-source license has been granted. Do not describe the project as open source until the owner chooses a license. Dependencies retain their respective licenses.