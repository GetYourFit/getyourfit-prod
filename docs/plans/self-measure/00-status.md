# Weekly product improvement

Authority: Firstmate's `gyf-self-measure` brief and inbox 001. No production activation, backlog write, source adoption, spending, publication, or authority change is delegated to this worker.

Applies the universal-standards feature workflow (`references/10-feature-workflow.md`), G8, G11, G12, G16-G20 and G28-G30. See [measurement reference](../../self-measurement.md).

| Gate | State | Evidence |
| --- | --- | --- |
| Product | approved by task mandate | Measure actual product weaknesses and evaluate bounded corrections; proposal volume supplies no benefit claim. No customer UI changes. |
| Architecture | approved by task mandate | Canonical collection and cohort definitions belong to gyf-outcome-measurement. Consume its published versioned reader only. Reuse Workflow's weekly maintenance, observation ledger, queue planner and fixed trial arbiter. |
| Program design | implemented | Product CLI reads the versioned aggregate reader and accepted quality receipts. It emits existing Workflow observation envelopes and one recommendation for Firstmate's backlog lease owner. It never writes a production queue or edits product source. |
| Consumer and isolated drill | verified locally | All 92 SQLite/Postgres product tests passed, including eight consumer/integration tests. Lint, production build and workflow-kit checks passed. The actual CLI returned insufficient_data with the producer absent. The synthetic drill used the existing Workflow modules and proved kept, discarded and inconclusive outcomes plus undo. |
| Live integration | pending owner adoption | Producer integration and the smallest existing weekly input delta are recorded in docs/self-measurement.md. Additional metric readers are unavailable. No schedule activation or production improvement is claimed. |

Canonical Workflow integration inspected read-only at `/Users/rvzaku/firstmate/projects/workflow`: `scripts/weekly.py`, `scripts/observations.py`, `scripts/freshness.py`, `scripts/metrics.py`, `registry/experiments.md`, `machine/manifest.md`. The weekly schedule is owned by `scripts/install-workflow`. This change installs no second schedule. Workflow's internal correction queue is not Firstmate's dispatch backlog. Firstmate routes product recommendations through its existing backlog owner, as instructed in inbox 001.

Live enablement remains pending producer integration, green merge and Firstmate activation. Installed and executed are separate facts. Isolated synthetic drills prove mechanics only. They do not establish customer outcomes or adoption gains.

Local validation ran on the uncommitted implementation. It is not exact-head CI evidence. Raw logs and the synthetic receipt remain outside the repository under Firstmate's task evidence directory. No-mistakes validation and publication start only after Firstmate's handoff instruction. Shared dependency advisories found by npm audit were routed to Firstmate; hosting owns their correction.
