# Acceptance findings

## AF-001: App shell paragraph fails WCAG AA color contrast

- Requirement: A-1 (accessibility pass, WCAG AA at least)
- Reproduction: run `npm run acceptance` against the production build. The `A-1 page passes automated WCAG accessibility checks` case reports `color-contrast` on `p`.
- Expected: visible text meets WCAG AA contrast requirements.
- Actual: the paragraph using `--muted-ink` fails the automated contrast check.
- Evidence: `tests/acceptance/results/report.json` (generated locally; not committed).

Cases whose cited requirement is still pending or deferred in [requirements](requirements.md) are reported as `not_yet_applicable` with that status as the reason.
