# GetYourFit black-box acceptance

Run `npm ci --prefix tests/acceptance` and install the zero-cost Playwright browser with `npx --prefix tests/acceptance playwright install chromium`. Then run `npm run acceptance` from the repository root. The command builds the app for production, serves that build on `127.0.0.1:4179`, and uses an isolated temporary data directory. It does not import application code. API and browser interactions use public product behavior.

The runner writes `tests/acceptance/results/report.json` and saves a screenshot for each failed browser case under `tests/acceptance/results/screenshots/`. Journeys absent from the running product are marked `not_yet_applicable` and do not count as passes or failures. Set `ACCEPTANCE_BASE_URL` to exercise an already running app instead of starting the local production preview. Set `ACCEPTANCE_MAIL_CATCHER_URL` to the local Mailpit HTTP API when email flows are available. Addresses are synthetic `example.test` values.

The contract stub is reserved for checking the suite itself. `npm run acceptance:stubs --prefix tests/acceptance` runs every case against a good stub, then verifies that each corresponding mutation is detected. Set `ACCEPTANCE_STUB=1` only when running that verifier; the normal command always targets a production build or an explicitly configured app.
