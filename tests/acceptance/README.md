# GetYourFit v0.1 acceptance

This independent checker covers the captain's 2026-10-12 version ladder: email/password signup, one real garment photo, one complete explained outfit suggestion, and no real mail. Cases come from R4, R5, R7, R14, R19, R26, R27 and A-1, restricted to those v0.1 journeys. Every case is mandatory. Neither product readiness labels nor a missing route can turn a failure into a pass.

From the repository root:

```sh
npm ci
npm ci --prefix tests/acceptance
(cd tests/acceptance && npx playwright install chromium)
npm run acceptance
```

The existing root npm script invokes this package. Playwright runs an actual headless Chromium browser with separate contexts and public API requests. It supports repeatable isolated sessions and file uploads in Linux CI without a service account or charge. Interactive inspection uses chrome-devtools-axi. Browser installation follows [Playwright's CI documentation](https://playwright.dev/docs/ci).

The runner builds the app for production and launches `npm start` on `127.0.0.1:4174`. It refuses an occupied application or mail port. A private temporary directory is supplied as `GYF_DATA_DIR`; `DATABASE_URL` names a SQLite database inside it. The service must honor these isolation settings. Only a small process-environment allowlist is inherited; deployment credentials and mail-provider keys are excluded. `NODE_ENV=production`, `APP_URL`, `HOST` and `PORT` define the production-equivalent local boundary.

For v0.1, `GYF_MAIL_MODE=disabled`. A local SMTP sink on `127.0.0.1:4180` is configured through `SMTP_HOST`, `SMTP_PORT` and `SMTP_URL`, and any message received causes a failure. Signup must immediately yield a usable account without email verification. The browser refuses external requests. No real user, production database, external mailbox or service signup is used. Future provider-backed mail reopens at v0.2 when a provider is named.

If the repository has only a static shell and no `npm start`, the runner records a mandatory service-contract failure and uses a production Vite preview to collect remaining browser/API findings. This fallback can never produce a green result. It cannot substitute for a product server.

Set `ACCEPTANCE_OUTPUT` to an absolute scratch directory for stable report paths. Otherwise the runner creates a directory under the system temporary directory and prints its report location. The machine-readable `report.json` records release, exact local HEAD, runtime, case requirements, errors, durations and screenshot paths. Email/password inputs are masked in screenshots and generated credentials are redacted from diagnostics. Service logs stay in memory and are checked for generated passwords and emails. Process groups, browser contexts, mail sockets and disposable storage are cleaned up after the run.

The public boundary expected by this checker is in [CONTRACT.md](CONTRACT.md). No application imports, builder verification scripts or implementation-derived assertions are used. A transport mismatch is a finding to reconcile against this written boundary, never a reason to silently weaken the behavior being checked.

## Proof that the checker detects failures

```sh
npm run acceptance:stubs --prefix tests/acceptance
```

The verifier first requires all six cases to pass against a good contract stub. It then runs each case against a targeted bad variant, requiring that exact case to fail and the process to exit 1. Sixteen variants cover broken browser signup, registration, session continuity, duplicate takeover, wrong-password acceptance, user enumeration, broken stored photo, ignored consent, accepted corrupt media, incomplete outfits, ignored photo, and read/update/delete/photo/list isolation failures. Proof is written to `stub-mutations.json` in the output directory.

Stubs are test oracles for the checker, never product evidence. Normal `npm run acceptance` ignores inherited `ACCEPTANCE_STUB` and `MUTATION` values and always builds the app. Selective execution is refused outside explicit `--stub` mode. CI must execute both the verifier and the normal production command.

## CI handoff

[ci/acceptance.yml](ci/acceptance.yml) is the exact workflow for an integration owner to install as `.github/workflows/acceptance.yml`. This worker is restricted to `tests/acceptance/`, so the file is a handoff artifact, not an active check. Until integration, acceptance does not gate deployment. Require the `acceptance` check beside `quality`, and let a deploy depend on both jobs from the same revision. For a separate deploy workflow, verify successful checks on its exact commit SHA; a green check on an ancestor is insufficient. Do not use path filters, `continue-on-error`, readiness-based skipping or contract-stub output to satisfy that gate.

## Sequenced coverage

This is v0.1 evidence, not full R1-R37 acceptance. Real mail, verification/reset links, lockout, global signout, TOTP, account export/deletion, vision correction and provenance, model judgment evaluation, broader accessibility/contrast, security headers, offline/server-down recovery, performance and deployed-environment evidence reopen with the next corresponding version. No claim about those capabilities is made by a v0.1 green result. The wider requirements remain in the canonical requirements document. Current product findings are recorded in [FINDINGS.md](FINDINGS.md) for firstmate to incorporate into `docs/acceptance-findings.md`.
