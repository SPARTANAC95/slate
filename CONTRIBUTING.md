# Contributing to Slate

Start with the [developer guide](docs/DEVELOPMENT.md). Keep changes focused and explain the behavior you changed, how to reproduce it, and how you checked it.

Before opening a pull request, run `npm test`, `npm run build`, and, on Windows, `cargo test --locked --lib` from `src-tauri`. Changes to native behavior also need a packaged Windows build and a runtime check.

Browser and Rust implementations of metadata lookup and backup rotation must agree. Add regression coverage when changing date parsing, imports, reminders, or sync behavior. Use fictional entries for screenshots and tests.

Never commit `.env` files, API keys, OAuth downloads, local backups, calendar exports, or build output. Run local browser development on loopback only.

This repository does not currently grant an open-source license. Contact the owner before redistributing or reusing the source beyond rights granted by GitHub's terms.
