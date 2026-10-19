# GetYourFit acceptance

The main independent checker covers email/password signup, confirmed garment facts, private photos, complete outfits from owned garments, the one-shirt and missing-fact alternatives, zero-garment starter plans, India shopping links, no real mail, public explained examples, phone account entry, and text contrast. Its twelve cases cover R4, R5, R7, R9, R10, R11, R19, R26, R27, R30, S1 and A-1. Every case is mandatory. Neither product readiness labels nor a missing route can turn a failure into a pass.

From the repository root:

```sh
npm ci
npm ci --prefix tests/acceptance
(cd tests/acceptance && npx playwright install chromium)
npm run acceptance
```

The existing root npm script invokes this package. Playwright runs an actual headless Chromium browser with separate contexts and public API requests. It supports repeatable isolated sessions and file uploads in Linux CI without a service account or charge. Interactive inspection uses chrome-devtools-axi. Browser installation follows [Playwright's CI documentation](https://playwright.dev/docs/ci).

The runner first requires an `npm start` production service. If it is missing, the runner records a mandatory failure and stops without building or serving a static preview. Otherwise it builds the app and launches `npm start` on a free ephemeral loopback port chosen per run. The contract stub and local mail sink also use free ephemeral loopback ports. A private temporary directory is supplied as `GYF_DATA_DIR`; `DATABASE_URL` names a SQLite database inside it. The service must honor these isolation settings. Only a small process-environment allowlist is inherited; deployment credentials and mail-provider keys are excluded. `NODE_ENV=production`, `APP_URL`, `HOST` and `PORT` define the production-equivalent local boundary.

The main runner explicitly selects the disabled test transport defined in [CONTRACT.md](CONTRACT.md#production-process). Any message received by its local SMTP sink causes a failure. The browser refuses external requests. No real user, production database, external mailbox or service signup is used. This test configuration does not describe the application's default mail mode; see [Mail settings](../../README.md#mail-settings).

Run the separate SMTP browser check from the repository root after installing the dependencies and Chromium above:

```sh
npm run acceptance:mail-delivery --prefix tests/acceptance
```

This check also requires `openssl` on PATH to generate a disposable certificate. It starts Vite and the API in development mode with a temporary database under `.gyf-data/`, plus an authenticated loopback SMTP server with STARTTLS. It drives signup, blocked unverified sign-in, verification-link replacement, verification, sign-in, and password reset, including rejection of the old password. It configures delivery through environment values without the bundled mock mailbox. It does not prove a production build or delivery by an external provider.

Set `ACCEPTANCE_OUTPUT` to an absolute scratch directory for stable report paths. Otherwise the runner creates a directory under the system temporary directory and prints its report location. The machine-readable `report.json` records release, exact local HEAD, runtime, case requirements, errors, durations and screenshot paths. Email/password inputs and visible generated credentials are masked in screenshots; diagnostics redact generated credentials. Service logs stay in memory and are checked for generated passwords and emails. Process groups, browser contexts, mail sockets and disposable storage are cleaned up after the run.

The public boundary expected by this checker is in [CONTRACT.md](CONTRACT.md). No application imports, builder verification scripts or implementation-derived assertions are used. A transport mismatch is a finding to reconcile against this written boundary, never a reason to silently weaken the behavior being checked.

## Proof that the checker detects failures

```sh
npm run acceptance:stubs --prefix tests/acceptance
```

The verifier first requires all twelve cases to pass against a good contract stub. It then runs each case against a targeted bad variant, requiring that exact case and its intended assertion to fail and the process to exit 1. Fifty-seven variants cover a low-contrast paragraph, broken browser signup, missing or optional browser age confirmation, API acceptance of unchecked or missing 18+ confirmation, accepted empty signup Name, registration, session continuity, duplicate takeover, wrong-password acceptance, user enumeration, broken stored photo, ignored consent, accepted corrupt media, incomplete outfits, ignored photo, signed-in and anonymous read/update/delete/photo/list isolation, a changed image after refresh, unowned, unavailable, non-fitting and incompatible complete-outfit items, a fabricated single-shirt outfit, fabricated outcomes for unknown weather or dress code, fake starter-plan purchasability, incorrect budget allocation, contradictory outfit/ownership needs, planned/owned state mixing, and shopping links that carry extra tracking fields or redirect away from their named retailer section. Existing additions cover the public example, facts disclosure, privacy, signup and phone controls, and photo consent. Proof is written to `stub-mutations.json` in the output directory.

The contrast case runs axe-core's `color-contrast` rule on public, sign-in, signup, and signed-in wardrobe/account pages at 390px, 768px, and 1440px. It requires evaluated text, zero violations, and zero unresolved checks. `contrast.json` records selectors and measured contrast checks; masked full-page screenshots capture each surface and width. The bad paragraph restores the original `#74736b` text on `#f4f1eb` at 14px. It must fail the contrast assertion, rather than setup or another journey check. The public case additionally runs full axe WCAG 2 A/AA and 2.1 A/AA scans, blocks account APIs to prove independent public rendering, and checks a compressed public module. Keyboard signup injects a temporary server error, checks focused recovery without lost fields, then retries with Enter and requires an empty wardrobe. The separate touch-enabled browser case submits by tap. See [CONTRACT.md](CONTRACT.md) for the hosted-storage privacy requirements. These checks do not establish full WCAG conformance.

The browser first tries the required Name field empty, then supplies a name and tries signup with the required 18+ checkbox unchecked; both attempts must be refused without an auth request. It checks that a missing age control fails, then confirms signup with age checked, a successful response, a closed signup form and a private session cookie before looking for garment controls. API signup checks also reject false or omitted age confirmation and verify that rejected accounts cannot be used. After attaching the real shirt photo, it confirms wearer facts and ownership before saving. The one-shirt outfit request must ask one question or abstain; after refresh, the rendered image must remain decoded, match the returned `photoUrl`, and retain the same rendered pixels. The isolation case checks anonymous and other-user collection reads along with item updates, deletion and photo access. The API cases separately verify a complete set among disqualified distractors and both unknown-weather and unknown-dress-code alternatives. An unsubmitted form cannot become a missing-photo finding.

The [starter-plan contract](CONTRACT.md#zero-garment-starter-plan-precursor) owns that case's expected behavior and coverage. The [shopping-links contract](CONTRACT.md#india-shopping-links) owns the shopping case. The targeted browser regressions run with `npm run acceptance:starter-regressions --prefix tests/acceptance`; contrast regressions run with `npm run acceptance:contrast-regressions --prefix tests/acceptance`.

`npm run acceptance:privacy-mutations --prefix tests/acceptance` runs only the production browser journeys that show wardrobe/account, consent, and saved-garment screens. Each clean screen must pass the privacy verifier; the runner then injects a visible false device-only claim into that screen's DOM and requires the same verifier to fail at that surface's privacy assertion. It removes the injected node and requires the clean screen to pass again. The regular production acceptance run performs these checks too. Contract stubs do not count as proof for these production mutations.

Stubs are test oracles for the checker, never product evidence. Normal `npm run acceptance` ignores inherited `ACCEPTANCE_STUB` and `MUTATION` values and always builds the app. Selective execution is refused outside explicit `--stub` mode. CI must execute both the verifier and the normal production command.

## CI integration

The [active acceptance workflow](../../.github/workflows/acceptance.yml) installs both locked dependency sets and Chromium on Node.js 24. Its job is named `acceptance` and runs on every pull request and push. It requires the good stub to pass, all known-bad variants to fail as intended, all production cases to pass through `npm start`, and the separate SMTP browser check above to pass. The main runner's reports and screenshots are retained as a CI artifact for seven days. [ci/acceptance.yml](ci/acceptance.yml) preserves the original handoff template.

`acceptance` passed on the integration merge on `main` and is required beside `quality`; [workflow-kit.md](../../docs/workflow-kit.md) records the verified protection state and exact run. Let a deploy depend on both checks from the same revision. For a separate deploy workflow, verify successful checks on its exact commit SHA; a green check on an ancestor is insufficient. Do not use path filters, `continue-on-error`, readiness-based skipping or contract-stub output to satisfy that gate.

## Sequenced coverage

The main journey cases are not full R1-R37 acceptance. Verification and reset links have the separate SMTP browser check above. External-provider delivery, lockout, global signout, TOTP, account export/deletion, vision correction and provenance, model judgment evaluation, accessibility beyond the documented automated scans and account-entry checks, security headers, offline/server-down recovery, performance, and deployed-environment evidence remain outside this suite's proof. The wider requirements remain in the canonical requirements document. Historical product findings are recorded in [FINDINGS.md](FINDINGS.md); current findings are in [acceptance-findings.md](../../docs/acceptance-findings.md).
