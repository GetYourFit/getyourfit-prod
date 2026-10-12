# Acceptance findings

## AF-001: App shell paragraph fails WCAG AA color contrast

- Status: deferred to a later version. The finding stays recorded; it is not resolved.
- Requirement: A-1 (accessibility pass, WCAG AA at least)
- Observed: an earlier suite revision ran an automated WCAG check against the production build and reported `color-contrast` on `p`. The paragraph using `--muted-ink` fails the automated contrast check.
- Expected: visible text meets WCAG AA contrast requirements.
- Why deferred: the final v0.1 suite has six cases for browser signup, API signup, credential refusal, photo handling, outfit creation, and privacy isolation. It has no accessibility, axe, or contrast case. The README "Sequenced coverage" section sequences broader accessibility and contrast to a later version, so `npm run acceptance` does not currently reproduce this defect.
- Reopen condition: the accessibility and contrast case returns in the version that covers it, per README "Sequenced coverage". This finding is then verified again against the production build.
- Evidence: none is produced by the current suite. The runner writes `report.json` to a temporary directory, or to `ACCEPTANCE_OUTPUT` when set; report statuses are `passed` or `failed` only.
