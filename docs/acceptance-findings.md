# Acceptance findings

## AF-001: App shell paragraph fails WCAG AA color contrast

- Status: resolved in the local v0.2 contrast increment. Required CI and deployment remain separate gates.
- Requirement: A-1 (accessibility pass, WCAG AA at least)
- Observed: axe-core reproduced `color-contrast` on the production-built wardrobe and account paragraphs using `--muted`: `#74736b` on `#f4f1eb` measured 4.22:1, below 4.5:1. Sign-in copy, labels, quiet text, and small accent text also failed.
- Expected: visible text meets WCAG AA contrast requirements.
- Fix: muted and quiet text use `#68675f`; the warm accent uses `#a44d37`. Labels and sign-in copy use the shared tokens. Surfaces, content, and layout retain their existing design.
- Enforcement: `npm run acceptance` includes a mandatory axe-core `color-contrast` case on signed-out, signup, and signed-in wardrobe/account pages at 390px and 1440px. Each scan requires evaluated text, zero violations, and zero checks needing manual review. The required `acceptance` job and workflow-kit acceptance hook already run this command.
- Known-bad proof: the `contrast` stub restores `#74736b` on `#f4f1eb` at 14px. The verifier detected the intended 4.22:1 failure and required exit 1. All nine good-stub cases passed and all thirty-two bad variants were detected.
- Local evidence (2026-10-14): all nine production cases passed using the working tree based on `8dc09dd`; the report correctly records `worktree_clean: false`. All six contrast scans passed, evaluating 13-49 text nodes per scan. Browser inspection captured before/after screenshots. `report.json`, `contrast.json`, masked screenshots, and `stub-mutations.json` stay outside the repository in caller-selected `ACCEPTANCE_OUTPUT` storage.
- Limits: this resolves contrast on the scanned surfaces. It does not establish full WCAG conformance, keyboard or screen-reader behavior, loading/error-state coverage, or deployed-page conformance. Those remain in the wider A-1 quality work.
