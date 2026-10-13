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

The runner first requires an `npm start` production service. If it is missing, the runner records a mandatory failure and stops without building or serving a static preview. Otherwise it builds the app and launches `npm start` on a free ephemeral loopback port chosen per run. The contract stub and local mail sink also use free ephemeral loopback ports. A private temporary directory is supplied as `GYF_DATA_DIR`; `DATABASE_URL` names a SQLite database inside it. The service must honor these isolation settings. Only a small process-environment allowlist is inherited; deployment credentials and mail-provider keys are excluded. `NODE_ENV=production`, `APP_URL`, `HOST` and `PORT` define the production-equivalent local boundary.

For v0.1, `GYF_MAIL_MODE=disabled`. A local SMTP sink on a free ephemeral loopback port is configured through `SMTP_HOST`, `SMTP_PORT` and `SMTP_URL`, and any message received causes a failure. Signup must immediately yield a usable account without email verification. The browser refuses external requests. No real user, production database, external mailbox or service signup is used. Future provider-backed mail reopens at v0.2 when a provider is named.

Set `ACCEPTANCE_OUTPUT` to an absolute scratch directory for stable report paths. Otherwise the runner creates a directory under the system temporary directory and prints its report location. The machine-readable `report.json` records release, exact local HEAD, runtime, case requirements, errors, durations and screenshot paths. Email/password inputs and visible generated credentials are masked in screenshots; diagnostics redact generated credentials. Service logs stay in memory and are checked for generated passwords and emails. Process groups, browser contexts, mail sockets and disposable storage are cleaned up after the run.

The public boundary expected by this checker is in [CONTRACT.md](CONTRACT.md). No application imports, builder verification scripts or implementation-derived assertions are used. A transport mismatch is a finding to reconcile against this written boundary, never a reason to silently weaken the behavior being checked.

## Proof that the checker detects failures

```sh
npm run acceptance:stubs --prefix tests/acceptance
```

The verifier first requires all eight cases to pass against a good contract stub. It then runs each case against a targeted bad variant, requiring that exact case and its intended assertion to fail and the process to exit 1. Thirty-one variants cover broken browser signup, missing or optional browser age confirmation, API acceptance of unchecked or missing 18+ confirmation, accepted empty signup Name, registration, session continuity, duplicate takeover, wrong-password acceptance, user enumeration, broken stored photo, ignored consent, accepted corrupt media, incomplete outfits, ignored photo, signed-in and anonymous read/update/delete/photo/list isolation, a changed image after refresh, unowned, unavailable, non-fitting and incompatible complete-outfit items, a fabricated single-shirt outfit, and fabricated outcomes for unknown weather or dress code. Proof is written to `stub-mutations.json` in the output directory.

The browser first tries the required Name field empty, then supplies a name and tries signup with the required 18+ checkbox unchecked; both attempts must be refused without an auth request. It checks that a missing age control fails, then confirms signup with age checked, a successful response, a closed signup form and a private session cookie before looking for garment controls. API signup checks also reject false or omitted age confirmation and verify that rejected accounts cannot be used. After attaching the real shirt photo, it confirms wearer facts and ownership before saving. The one-shirt outfit request must ask one question or abstain; after refresh, the rendered image must remain decoded, match the returned `photoUrl`, and retain the same rendered pixels. The isolation case checks anonymous and other-user collection reads along with item updates, deletion and photo access. The API cases separately verify a complete set among disqualified distractors and both unknown-weather and unknown-dress-code alternatives. An unsubmitted form cannot become a missing-photo finding.

Stubs are test oracles for the checker, never product evidence. Normal `npm run acceptance` ignores inherited `ACCEPTANCE_STUB` and `MUTATION` values and always builds the app. Selective execution is refused outside explicit `--stub` mode. CI must execute both the verifier and the normal production command.

## CI integration

The [active acceptance workflow](../../.github/workflows/acceptance.yml) installs both locked dependency sets and Chromium on Node.js 24. Its job is named `acceptance` and runs on every pull request and push. It requires the good stub to pass, all known-bad variants to fail as intended, and all production cases to pass through `npm start`. Reports and screenshots are retained as a CI artifact for seven days. [ci/acceptance.yml](ci/acceptance.yml) preserves the original handoff template.

After `acceptance` passes on the integration merge on `main`, require it beside `quality` without loosening existing protection. That settings change follows this CI integration. Let a deploy depend on both checks from the same revision. For a separate deploy workflow, verify successful checks on its exact commit SHA; a green check on an ancestor is insufficient. Do not use path filters, `continue-on-error`, readiness-based skipping or contract-stub output to satisfy that gate.

## Sequenced coverage

This is v0.1 evidence, not full R1-R37 acceptance. Real mail, verification/reset links, lockout, global signout, TOTP, account export/deletion, vision correction and provenance, model judgment evaluation, broader accessibility/contrast, security headers, offline/server-down recovery, performance and deployed-environment evidence reopen with the next corresponding version. No claim about those capabilities is made by a v0.1 green result. The wider requirements remain in the canonical requirements document. Current product findings are recorded in [FINDINGS.md](FINDINGS.md) for firstmate to incorporate into `docs/acceptance-findings.md`.
