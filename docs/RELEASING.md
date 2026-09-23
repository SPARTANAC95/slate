# Releasing Slate

Installed copies receive **published stable releases**, not individual commits. Keep `com.slate.app` unchanged so the existing calendar and settings stay in their original location.

## For people using Slate

Install 0.1.1 or newer once. In **Preferences → App updates**, leave automatic checks on or choose **Check for updates**. When a version is available, read its notes and choose **Install and restart**. Save any open form first. The download is verified, pending notes are saved, and a fresh calendar backup must succeed before installation starts. An error leaves Slate open so you can retry.

Automatic checks run shortly after startup and every six hours while Slate is running, including in the tray. **Later** hides the banner for that version until restart; the update stays available in Preferences. There is no silent installation.

## Prepare a version

1. Increase the version in `package.json`, `package-lock.json` (both root entries), `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Refresh `Cargo.lock` with `cargo check --manifest-path src-tauri/Cargo.toml` if needed. Use a stable version such as `0.1.2`.
2. Add `releases/v0.1.2.md` with the user-facing changes and any migration instructions.
3. Test the app, commit, and push `main`. Create and push a matching tag from that clean commit:

```sh
git tag v0.1.2
git push origin main v0.1.2
```

The **Publish Windows release** workflow runs checks, builds a signed installer, and publishes a release only after all four assets have uploaded. It requires repository Actions secrets named `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. An Actions billing/account lock prevents this workflow from running; use the local path below until it is resolved.

## Build and publish from this PC

On Windows x64, from the clean tagged commit:

```sh
npm ci
npm run release:build
npm run release:publish
```

The build runs frontend tests, Rust tests, the web build, and NSIS packaging, with two workers by default. It creates `output/release/vVERSION/` containing the installer, its `.sig`, `latest.json`, and `SHA256SUMS.txt`. Publishing uses `GITHUB_TOKEN` or your Git Credential Manager login. It checks that the build came from the current clean commit, that the pushed tag matches, and that the artifact hashes still match. It stages uploads in a draft and publishes last. Rerun publishing to finish an interrupted draft; published releases are never overwritten.

On the configured Windows account, the local key is `%USERPROFILE%\.tauri\slate-updater.key`. It is encrypted; its password is protected with Windows DPAPI in the adjacent `.password.dpapi` file. The script unlocks it in memory. Other build machines can instead supply `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as environment secrets. Never add either value to Git or logs.

Keep a secure, recoverable backup of the encrypted key **and its password** in your password manager. Copying the DPAPI file to another Windows account or reinstall is not a portable password backup. Losing the signing key prevents existing installations from accepting future updates signed with a new key.

For unsigned development/PR packages that do not require the private key:

```sh
npm run build:app
```

Update signatures are distinct from Windows Authenticode signing. Windows can still show an unknown publisher warning.

## Validation

`npm test` covers update sequencing, retry behavior, signature/download failures, backup failure, duplicate clicks, preferences, resource cleanup, and release manifest generation. `/tools/update-preview.html` is a browser-only fixture for checking the real update UI with simulated native responses; open it through Vite in a separate test profile. It never installs software and is not bundled into the app. Real installed-app replacement and restart require a Windows upgrade test in an isolated machine/profile.

After publishing, `cargo run --release --example check_update --manifest-path src-tauri/Cargo.toml` checks the real GitHub feed, downloads and verifies the released installer, and confirms that an invalid signature is rejected. This separate diagnostic uses its own application identifier, opens no window, and never installs anything.
