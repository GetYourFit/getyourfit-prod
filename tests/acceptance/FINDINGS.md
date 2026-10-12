# v0.1 independent acceptance findings

Observed on 2026-10-12 against the production build of the current app shell. The checker was being edited at the time; final reports after its commit establish the exact clean HEAD. Product code was neither read to shape assertions nor edited. Proof is stored outside the worktree under `/Users/rvzaku/firstmate/data/gyf-acceptance/v0.1/`.

These entries are checker-owned handoff material for firstmate to incorporate into `docs/acceptance-findings.md`. This worker may edit only `tests/acceptance/`.

## AF-V01-001: No production API service

- Requirements: R4, A-1.
- Reproduce: install the app and checker dependencies; run `npm run acceptance` from the repository root with `ACCEPTANCE_OUTPUT` pointing to a scratch directory.
- Expected: `npm start` serves the production application and its API against the supplied disposable database.
- Actual: the production manifest has no start command. The runner records a mandatory failure and serves the built static shell only to collect further evidence.
- Evidence: `production/report.json`, case `V01 production API service`.

## AF-V01-002: New user cannot begin signup

- Requirements: R4, R5, R26, A-1.
- Reproduce: run the production acceptance command, or build and serve the production page and open it in a clean browser.
- Expected: an obvious accessible signup action starts the v0.1 photo-to-outfit journey.
- Actual: the page contains only GetYourFit and "Sign-in and the wardrobe arrive in the next updates." There is no signup action. The browser case fails while locating the primary action.
- Evidence: `production/report.json`, its browser failure screenshot, and `production/manual-shell.png` from chrome-devtools-axi. Independent browser inspection found no console messages.

## AF-V01-003: Signup API returns 404

- Requirements: R4, R26, R27, A-1.
- Reproduce: run `npm run acceptance`. It sends a new synthetic email, a cryptographically generated password and explicit age confirmation to `POST /api/auth/register` with the app Origin.
- Expected: account creation returns JSON and a private usable session without email.
- Actual: the production static service returns HTTP 404. All five API cases fail at signup. Session continuity, credential refusal, photo persistence, outfit creation and privacy isolation remain unverified; these are prerequisite failures, not independently confirmed defects in downstream routes.
- Evidence: all five API case errors in `production/report.json`. The run reports 7 failures, 0 passes and 0 skips, including the service-contract and browser failures. An inherited `ACCEPTANCE_STUB=1` and `MUTATION=signup` did not redirect the normal production command to a stub.

## Integration follow-up

The acceptance workflow is supplied as `tests/acceptance/ci/acceptance.yml`; it is not installed under `.github/workflows/` because that path is outside this worker's scope. No active acceptance job, required-check setting, exact-head deployment refusal or deployed `app.getyourfit.co` evidence is claimed. Firstmate must integrate the workflow beside quality, require acceptance, and connect deployment to both successful jobs at the deployed revision.

The attempted `gh-axi pr list --state open` read failed because the Automic Vault approval service was not running. No GitHub write or pipeline restart was attempted. The lane remains on its preserved branch with no-mistakes reporting `user_owned` custody.

## Later-version coverage

Real email remains sequenced to v0.2 when a provider is named. Other wider requirements are not graded by this v0.1 suite. See README for explicit coverage boundaries; a green contract stub is never product evidence.
