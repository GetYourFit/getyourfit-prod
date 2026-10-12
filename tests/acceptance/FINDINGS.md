# v0.1 independent acceptance findings

Historical shell findings and current account-build findings are distinguished below. The current product base is `d09e2fbfb19f45704fb36070f9d5955211225b6e` (wardrobe photos and owned-outfit decisions landed). Earlier evidence bound to `c3577aa` is historical only. Product code was neither read to shape assertions nor edited. Proof is stored outside the worktree under `/Users/rvzaku/firstmate/data/gyf-acceptance/v0.1/`. Reports record the checker HEAD and whether its worktree was clean; pre-commit evidence is explicitly marked dirty.

These entries are checker-owned handoff material for firstmate to incorporate into `docs/acceptance-findings.md`. This worker may edit only `tests/acceptance/`.

## AF-V01-001: No production API service

- Status: historical, superseded by the account increment. Current production runs use `npm start` and reach the account service.
- Requirements: R4, A-1.
- Reproduce: install the app and checker dependencies; run `npm run acceptance` from the repository root with `ACCEPTANCE_OUTPUT` pointing to a scratch directory.
- Expected: `npm start` serves the production application and its API against the supplied disposable database.
- Actual: the production manifest has no start command. The runner records a mandatory failure and serves the built static shell only to collect further evidence.
- Evidence: `production/report.json`, case `V01 production API service`.

## AF-V01-002: New user cannot begin signup

- Status: historical, superseded by the account increment. Current production exposes signup and creates a usable browser session after its required fields are filled.
- Requirements: R4, R5, R26, A-1.
- Reproduce: run the production acceptance command, or build and serve the production page and open it in a clean browser.
- Expected: an obvious accessible signup action starts the v0.1 photo-to-outfit journey.
- Actual: the page contains only GetYourFit and "Sign-in and the wardrobe arrive in the next updates." There is no signup action. The browser case fails while locating the primary action.
- Evidence: `production/report.json`, its browser failure screenshot, and `production/manual-shell.png` from chrome-devtools-axi. Independent browser inspection found no console messages.

## AF-V01-003: Signup API returns 404

- Status: current transport mismatch at the checker-projected route; this does not establish that browser signup is broken.
- Requirements: R4, R26, R27, A-1.
- Reproduce: run `npm run acceptance`. It sends a new synthetic email, a cryptographically generated password and explicit age confirmation to `POST /api/auth/register` with the app Origin.
- Expected: account creation returns JSON and a private usable session without email.
- Actual: the service returns HTTP 404 at this route, re-confirmed on `d09e2fb`. All five API cases fail at signup. Browser signup uses a different public auth route and succeeds. Session continuity, credential refusal, photo persistence, outfit creation and privacy isolation remain unverified over the projected API; these are prerequisite failures, not independently confirmed defects in downstream routes. Reconcile the written transport boundary with the integration owner.
- Evidence: five API errors in the fresh production report at checker HEAD `1311310`. The run reports 6 failures, 0 passes and 0 skips. An inherited `ACCEPTANCE_STUB=1` and `MUTATION=empty-name` did not redirect the normal production command to a stub. The earlier static-shell report under `production/` is historical.

## AF-V01-004: Add garment opens no photo control

- Requirements: R4, R5, R7, A-1.
- Reproduce: run `npm run acceptance` against `d09e2fb`; the browser submits its Name empty, observes refusal, supplies a synthetic Name, valid email/password and age confirmation, and completes signup. It then activates the visible "Add garment" button and waits for a labeled garment photo input.
- Expected: a signed-in wearer can add one consented real garment photo and continue to an outfit suggestion.
- Actual (fresh production run, clean-base `d09e2fb`): signup returns 2xx, creates a private session and closes the signup form, so the prerequisite holds. The signed-in screen shows the wardrobe, an "Add garment" button, the outfit form and account controls. The checker clicks "Add garment" (a prior checker navigation gap, now fixed as CF-V01-002); afterwards, even 2 seconds later, the page has no file input, no dialog and no console or page errors, and the case fails waiting for the labeled photo control. Garment upload, consent, outfit and refresh steps are unreached and unverified.
- Evidence: fresh production report and screenshot; old `c3577aa` evidence is historical only.

## CF-V01-002: Checker did not open the Add garment entry point

- Status: repaired. The browser now activates a visible "Add garment" button when no photo control is visible, and the contract stub hides its photo form behind the same public button so the navigation is exercised. The case still fails meaningfully when neither entry nor input exists.

## CF-V01-001: Checker omitted the required signup Name

- Requirements: R4, R26, A-1.
- Status: repaired; independent pipeline validation follows the local good-stub and mutation proof.
- Reproduce before repair: run the prior checker and inspect its browser failure screenshot. Native validation says "Please fill out this field" on the empty Name input; waiting for garment controls then misidentifies a signup prerequisite failure.
- Repair: the browser tests empty-Name refusal, fills a synthetic Name, and observes a successful response, closed signup form and private session before checking garments. The `empty-name` stub removes that refusal and accepts the empty Name. Its intended assertion fails; all six good cases pass and all seventeen targeted mutations are detected.
- Evidence: `name-fix/proof/stub-mutations.json` and the before/after browser screenshots. The old misleading screenshot is retained under `fresh/final-evidence/production/`; it does not prove signup completed or a garment control was missing.

## Integration follow-up

The acceptance workflow is supplied as `tests/acceptance/ci/acceptance.yml`; it is not installed under `.github/workflows/` because that path is outside this worker's scope. No active acceptance job, required-check setting, exact-head deployment refusal or deployed `app.getyourfit.co` evidence is claimed. Firstmate must integrate the workflow beside quality, require acceptance, and connect deployment to both successful jobs at the deployed revision.

## Later-version coverage

Real email remains sequenced to v0.2 when a provider is named. Other wider requirements are not graded by this v0.1 suite. See README for explicit coverage boundaries; a green contract stub is never product evidence.
