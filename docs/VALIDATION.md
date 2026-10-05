# Validation — October 5, 2026

The maintained Slate planner checkout and its reference checkout matched GitHub
`main` and tag `v0.1.2` at `01fad0e8af1582994c4061f426574ddae41ec091`.
There were no unpublished planner application changes in those checkouts.
The normal Windows shortcut pointed to a version 0.1.2 executable. Its profile
and executable were not changed during this review.

Fresh checks in an isolated checkout:

- **171 JavaScript/TypeScript tests passed**, including date parsing, persistence,
  backlog scheduling, Google mapping/sync and update behavior.
- **19 Rust tests passed** on Windows, including protected credential storage.
- **TypeScript and production Vite build passed.**
- **Locked dependency installation reported no npm vulnerabilities.**
- **Native Windows release-mode build passed**, using a separate capture
  application identifier, with no installer or release created.
- Six native screenshots were inspected. All **42 local documentation/asset
  links** passed; the PNGs, capture version and screenshot-switcher assets passed.
- Browser presentation checks passed at **1440, 800, 390 and 320 pixels**:
  screenshot switching/decoding, enlargement and Escape, keyboard access to the
  Google FAQ, no horizontal overflow and no browser errors.
- Gitleaks reported no secrets in the publication checkout.

The screenshot capture uses real native commands and a disposable calendar,
including the native backup restore path and an unconfigured Google account.
See [capture provenance](PRESENTATION.md).

These results do not certify a fresh Google sign-in, live remote synchronization,
Windows notification delivery, every provider response or every computer.
No personal Google account, production calendar or API keys were used.
GitHub Actions results belong to their exact commit; consult the
[Checks workflow](https://github.com/SPARTANAC95/slate/actions/workflows/checks.yml)
for the published revision rather than treating this local report as a CI result.
