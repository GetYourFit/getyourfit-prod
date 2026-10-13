# v0.1 independent acceptance findings

Historical shell findings and checker defects are distinguished below. Independent verification of clean commit `90187b89c43869f5866f675f573a18c0a49a24c0` on 2026-10-13 passed all eight production cases and all eight good-stub cases; all thirty-one bad variants failed at their intended assertions. That checker includes product base `d09e2fbfb19f45704fb36070f9d5955211225b6e` (wardrobe photos and owned-outfit decisions landed). Earlier evidence bound to `c3577aa` is historical only. Product code was neither read to shape assertions nor edited. Reports record the checker HEAD and whether its worktree was clean; pre-commit evidence is explicitly marked dirty. The summaries below retain the observed failures without publishing private artifact locations.

These entries are checker-owned handoff material for firstmate to incorporate into `docs/acceptance-findings.md`. This worker may edit only `tests/acceptance/`.

## AF-V01-001: No production API service

- Status: historical, superseded by the production service. The clean verification above used a production build and `npm start`; no static preview was used.
- Requirements: R4, A-1.
- Reproduce: at the earlier checker revision, install the app and checker dependencies and run `npm run acceptance` from the repository root with `ACCEPTANCE_OUTPUT` pointing to a scratch directory.
- Expected: `npm start` serves the production application and its API against the supplied disposable database.
- Actual: that runner reported a missing production start command, then served a static preview to collect shell evidence. The current runner records the missing service as a mandatory failure and stops without running browser or API cases against a preview.
- Evidence: historical production failure report, case `V01 production API service`; that report does not establish current service availability.

## AF-V01-002: New user cannot begin signup

- Status: historical, superseded by the account increment. Current production exposes signup and creates a usable browser session after its required fields are filled.
- Requirements: R4, R5, R26, A-1.
- Reproduce: run the production acceptance command, or build and serve the production page and open it in a clean browser.
- Expected: an obvious accessible signup action starts the v0.1 photo-to-outfit journey.
- Actual: the page contains only GetYourFit and "Sign-in and the wardrobe arrive in the next updates." There is no signup action. The browser case fails while locating the primary action.
- Evidence: historical production failure report, inspected browser failure screenshot, and manual shell inspection through chrome-devtools-axi. Independent browser inspection found no console messages.

## AF-V01-003: Historical checker route projection returned 404

- Status: repaired checker transport defect. The checker now uses the signup, session, wardrobe, photo, and outfit routes observed through the public browser. All production API cases passed in the clean verification above.
- Requirements: R4, R26, R27, A-1.
- Reproduce the historical failure: use the earlier checker revision to send a new synthetic account to `POST /api/auth/register` with the app Origin.
- Expected: account creation returns JSON and a private usable session without email.
- Actual: the old projection returned HTTP 404, while public browser traffic used `POST /api/auth/sign-up/email` and `GET /api/session`. Wardrobe creation and outfit requests also used `/api/wardrobe` and `/api/wardrobe/outfit`. The checker contract has been reconciled to those observed routes and DTOs. The earlier report's API failures were prerequisite failures at the wrong route, not independently confirmed product defects.
- Evidence: five API errors in the historical production report at checker HEAD `1311310`, which sent requests to the projected route. A live local production browser observation on base `d09e2fb` confirmed the public request paths and response shapes. The earlier static-shell report is historical.

## CF-V01-003: Checker does not complete the garment facts confirmation

- Status: repaired; the completed browser journey passed in the clean verification above. The earlier AF-V01-004 claim that "Add garment" opens no photo control is retired; it was wrong.
- Requirements: R4, R5, R7, A-1.
- Observed (production run on `d09e2fb`; report head `4946ad1`): signup succeeds, the delayed Add garment entry opens the photo control, and the photo preview leads to a visible garment facts form. The earlier checker clicked Save without filling its required fields and observed no upload request at the projected wardrobe route.
- Repair: the browser now confirms synthetic shirt facts (name, top category, beige color, size M, fit, mild weather, smart-casual dress code, available status and ownership) before Save. The single-shirt request must ask one question or abstain. The API contract and stub separately exercise a complete owned set and unknown-weather/dress-code alternatives.
- Not established by the historical report: whether the completed browser form saves a garment, which route it uses, or whether the following question is displayed. The subsequent clean verification proves saving, the single-shirt clarification or abstention, exact photo rendering after refresh, and the separate API complete-set case.
- Evidence: historical production report at checker HEAD `4946ad1` and its inspected browser screenshot, with email and password masked. These artifacts predate the repair. Earlier `c3577aa` and prior-round evidence is historical only.

## CF-V01-002: Checker raced the Add garment entry point

- Status: repaired. The browser waits for a visible "Add garment" button or photo input, clicks the button only when the input is not visible, then waits for the input. The contract stub delays the button and places its hidden photo input first in document order. The verifier covers eight good cases and thirty-one targeted mutations, including browser/API 18+ refusal, anonymous collection isolation and exact photo rendering after refresh.

## CF-V01-001: Checker omitted the required signup Name

- Requirements: R4, R26, A-1.
- Status: repaired; the clean verification above passed the production browser journey and detected the empty-Name bad variant.
- Reproduce before repair: run the prior checker and inspect its browser failure screenshot. Native validation says "Please fill out this field" on the empty Name input; waiting for garment controls then misidentifies a signup prerequisite failure.
- Repair: the browser tests empty-Name refusal, fills a synthetic Name, and observes a successful response, closed signup form and private session before checking garments. The `empty-name` stub removes that refusal and accepts the empty Name. Its intended assertion failed at the original repair round; the current verifier also covers the later outfit alternatives.
- Evidence: good-stub and known-bad empty-Name checks, plus inspected browser screenshots before and after the repair. The old misleading screenshot does not prove signup completed or a garment control was missing.

## Integration follow-up

The acceptance workflow is supplied as `tests/acceptance/ci/acceptance.yml`; it is not installed under `.github/workflows/` because that path is outside this worker's scope. No active acceptance job, required-check setting, exact-head deployment refusal or deployed `app.getyourfit.co` evidence is claimed. Firstmate must integrate the workflow beside quality, require acceptance, and connect deployment to both successful jobs at the deployed revision.

## Later-version coverage

Real email remains sequenced to v0.2 when a provider is named. Other wider requirements are not graded by this v0.1 suite. See README for explicit coverage boundaries; a green contract stub is never product evidence.
