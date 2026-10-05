# Acceptance findings

## AF-001: No product target is available for production-equivalent acceptance

- Requirements: R26, A-1
- Reproduction: inspect the task worktree at `fm/gyf-acceptance`; the application foundation is absent: there is no app source, root `package.json`, or `docs/PRODUCT.md`.
- Expected: the production-mode app and its written contract are available so the black-box suite can exercise real authentication and product journeys.
- Actual: only the independent contract stub can run. The suite must be pointed at `ACCEPTANCE_BASE_URL` after the product foundation lands; real-app results are not yet available.
