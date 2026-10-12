# GetYourFit v0.1 acceptance

This independent checker covers email/password signup, confirmed garment facts, private photos, complete outfits from owned garments, the one-shirt and missing-fact alternatives, and no real mail. Its eight cases cover R4, R5, R7, R9, R10, R11, R19, R26, R27 and A-1. Every case is mandatory. Neither product readiness labels nor a missing route can turn a failure into a pass.

From the repository root:

```sh
npm ci
npm ci --prefix tests/acceptance
(cd tests/acceptance && npx playwright install chromium)
npm run acceptance
```

The existing root npm script invokes this package. Playwright runs an actual headless Chromium browser with separate contexts and public API requests. It supports repeatable isolated sessions and file uploads in Linux CI without a service account or charge. Interactive inspection uses chrome-devtools-axi. Browser installation follows [Playwright's CI documentation](https://playwright.dev/docs/ci).

The runner first requires an `npm start` production service. If it is missing, the runner records a mandatory failure and stops without building or serving a static preview. Otherwise it builds the app, launches `npm start` on `127.0.0.1:4174`, and refuses to run if that port is occupied. The contract stub and local mail sink use free ephemeral loopback ports chosen per run. A private temporary directory is supplied as `GYF_DATA_DIR`; `DATABASE_URL` names a SQLite database inside it. The service must honor these isolation settings. Only a small process-environment allowlist is inherited; deployment credentials and mail-provider keys are excluded. `NODE_ENV=production`, `APP_URL`, `HOST` and `PORT` define the production-equivalent local boundary.

For v0.1, `GYF_MAIL_MODE=disabled`. A local SMTP sink on a free ephemeral loopback port is configured through `SMTP_HOST`, `SMTP_PORT` and `SMTP_URL`, and any message received causes a failure. Signup must immediately yield a usable account without email verification. The browser refuses external requests. No real user, production database, external mailbox or service signup is used. Future provider-backed mail reopens at v0.2 when a provider is named.

Set `ACCEPTANCE_OUTPUT` to an absolute scratch directory for stable report paths. Otherwise the runner creates a directory under the system temporary directory and prints its report location. The machine-readable `report.json` records release, exact local HEAD, runtime, case requirements, errors, durations and screenshot paths. Email/password inputs and visible generated credentials are masked in screenshots; diagnostics redact generated credentials. Service logs stay in memory and are checked for generated passwords and emails. Process groups, browser contexts, mail sockets and disposable storage are cleaned up after the run.

The public boundary expected by this checker is in [CONTRACT.md](CONTRACT.md). No application imports, builder verification scripts or implementation-derived assertions are used. A transport mismatch is a finding to reconcile against this written boundary, never a reason to silently weaken the behavior being checked.

## Proof that the checker detects failures

```sh
npm run acceptance:stubs --prefix tests/acceptance
```

The verifier first requires all eight cases to pass against a good contract stub. It then runs each case against a targeted bad variant, requiring that exact case and its intended assertion to fail and the process to exit 1. Twenty-one variants cover broken browser signup, accepted empty signup Name, registration, session continuity, duplicate takeover, wrong-password acceptance, user enumeration, broken stored photo, ignored consent, accepted corrupt media, incomplete outfits, ignored photo, read/update/delete/photo/list isolation, an unowned complete outfit, a fabricated single-shirt outfit, and fabricated outcomes for unknown weather or dress code. Proof is written to `stub-mutations.json` in the output directory.

The browser first tries the required Name field empty and checks that the form refuses submission. It then supplies a synthetic name and confirms a successful signup response, a closed signup form and a private session cookie before looking for garment controls. After attaching the real shirt photo, it confirms wearer facts and ownership before saving. The one-shirt outfit request must ask one question or abstain; the API cases separately verify a complete owned set and both unknown-weather and unknown-dress-code alternatives. An unsubmitted form cannot become a missing-photo finding.

Stubs are test oracles for the checker, never product evidence. Normal `npm run acceptance` ignores inherited `ACCEPTANCE_STUB` and `MUTATION` values and always builds the app. Selective execution is refused outside explicit `--stub` mode. CI must execute both the verifier and the normal production command.

## CI handoff

[ci/acceptance.yml](ci/acceptance.yml) is the exact workflow for an integration owner to install as `.github/workflows/acceptance.yml`. This worker is restricted to `tests/acceptance/`, so the file is a handoff artifact, not an active check. Until integration, acceptance does not gate deployment. Require the `acceptance` check beside `quality`, and let a deploy depend on both jobs from the same revision. For a separate deploy workflow, verify successful checks on its exact commit SHA; a green check on an ancestor is insufficient. Do not use path filters, `continue-on-error`, readiness-based skipping or contract-stub output to satisfy that gate.

## Sequenced coverage

This is v0.1 evidence, not full R1-R37 acceptance. Real mail, verification/reset links, lockout, global signout, TOTP, account export/deletion, vision correction and provenance, model judgment evaluation, broader accessibility/contrast, security headers, offline/server-down recovery, performance and deployed-environment evidence reopen with the next corresponding version. No claim about those capabilities is made by a v0.1 green result. The wider requirements remain in the canonical requirements document. Current product findings are recorded in [FINDINGS.md](FINDINGS.md) for firstmate to incorporate into `docs/acceptance-findings.md`.
