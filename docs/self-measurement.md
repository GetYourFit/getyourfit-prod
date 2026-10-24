# Weekly product measurement

`node scripts/self-measure.mjs --workflow /absolute/workflow --quality /private/acceptance/report.json` reads aggregates and writes one JSON result to stdout. It does not install a schedule, write an event store or queue, mutate product source, dispatch work, or fetch secrets. The existing Workflow maintenance schedule remains the only schedule owner. This is an operator command, with no public metrics endpoint.

## Reader capabilities

| Capability | Canonical owner | Consumer behavior |
| --- | --- | --- |
| Consented real-account signup, selection, return within seven days | `server/outcome-report.mjs`, `readOutcomeCohort({from,to,asOf})`, contractVersion 1 | Read and validate published aggregates only. Missing module/version/schema, suppression, invalid results and failures produce `insufficient_data`. |
| Accounts, garments, outfits currently available | Inventory owner, no aggregate reader published at implementation | `insufficient_data`; no raw wardrobe or account query. Signup cohorts are not all account counts. Saved-look selection is not outfit generation. |
| Day-one return | Outcome owner, not in cohort v1 | `insufficient_data`; return within seven days is not day-one or day-seven retention. |
| Recognition failures | Recognition owner, no bounded reader published at implementation | `insufficient_data`; no photo, request or model-log access. |
| Request error and latency distributions | Operations runtime interface, reader not yet published at implementation | `insufficient_data`; no production-log mining or duplicate collector. |
| Accepted quality and accessibility checks | `tests/acceptance/src/run.mjs`, `gyf-acceptance-report/v2` | Fresh, complete, clean exact-revision production acceptance only. Contrast is the accessibility evidence currently reported, not complete accessibility conformance. |

The cohort reader owns consent, real/test classification, deletion, retention and all cohort query definitions. Its v1 contract excludes team, test, synthetic and unclassified accounts; requires explicit consent at signup; counts mature signups only in rates; and suppresses the entire cohort when fewer than five signups or any nonzero cell or complement is below five. This consumer independently rejects unsuppressed small counts and projects an aggregate allowlist. It never persists a cohort snapshot. Reader errors emit fixed reason codes, without exception text, identifiers, paths, credentials or raw data. No production content is training material.

The command chooses the most recent completed Monday-to-Monday signup cohort whose entire seven-day return window has elapsed. Withdrawal/deletion changes the producer's current result, so a historical result cannot be treated as an immutable population. A signup is an account observation, not proof of a unique person. Selection is not wear, keep, purchase, economic value or outfit quality. No causal product improvement follows from these rates alone.

Accepted quality receipts expire after seven days. Every current suite case must be present once, with no skips, at the command's clean HEAD. The consumer emits only aggregate results, revision, receipt digest and timestamp. It never forwards case error text, screenshots, URLs or account fixtures. A stub, old revision, dirty run or partial run cannot establish quality.

## Existing maintenance integration

The command's `workflow.observations` array uses Workflow's existing `scripts/observations.py` envelope, through `from_signals`. Each observation is eligible for the existing ledger only after its owner's normal validation. `scripts/weekly.py` remains the queue planner and sole writer of `registry/improvement-queue.md`. The product recommendation is for Firstmate's existing dispatch backlog, which only its lease owner writes. These two existing queues serve different owners. This command creates neither.

The same weakness must have two distinct keys in the existing ledger before a candidate is emitted. Repeating one cohort window or one acceptance revision does not count again. The existing queue planner receives these observations; the command returns its plan without writing it. At most one weakest measurable step is selected. A failed accepted journey takes priority over cohort rates. With no mature or accepted evidence, the result is `insufficient_data`.

Workflow at inspected revision `ac86f5a07447ac92927710aaab93f1762fff17bf` has no external-product observation input on `weekly.py`. Live integration is unresolved, and no live product schedule is claimed. The smallest owner-side delta is:

1. Existing weekly owner executes this command once during its current job, with scoped read credentials and an accepted quality receipt when available. Missing inputs are preserved as unavailable, not backfilled.
2. Validate each returned `workflow.observations` row using existing `observations.record_errors`, product-prefix and current-window checks. Include admitted rows in existing `seen` before `current_pairs`, `plan_queue` and `observations.append`. The existing publication/privacy scan remains mandatory. Do not copy whole cohort reports into the public ledger.
3. Route the single recommendation through Firstmate's existing backlog lease owner. An open queue item or proposal does not authorize adoption. Record its exact baseline, owner and bounded reproduction/evaluation task.
4. After green merge and producer integration, Firstmate activates the hook in the existing weekly job. Verify one actual job receipt separately from installation. Retain only operational evidence needed by the existing ledger and trial registry, never private source data.

This delta belongs to Workflow/Firstmate. It is not implemented in another checkout by this product branch. No schedule, service restart, production classification or deployment is performed here. Operations credentials stay in the existing vault path and are supplied by the caller under scoped read access; this command does not fetch a database superuser or broaden a vault scope.

## Fixed evaluation and adoption

Recommendations name an observed metric and baseline, one bounded change, what it replaces, a 14-day candidate expiry, fixed evaluation requirements, no-mistakes adoption, and undo. Before changing behavior, the responsible task must reproduce the weakness end to end and pre-register the exact baseline and evaluator, fixture and candidate identities, measured spread, guardrails, bounded window and numeric keep/discard rules in the existing trial registry. Missing metrics require a measured evaluator or a canonical owner extension; they must not be renamed to an unrelated supported metric. Workflow's existing frozen trial checks and arbiter own decisions. Contradictory evidence or any guardrail regression rejects a candidate. Insufficient evidence is inconclusive and keeps the simpler baseline. A retained real change still needs exact-head no-mistakes, authorized release and guarded rollback; an arbiter verdict cannot publish code.

`uv run --no-project --offline --no-cache scripts/self-measure/prove-workflow.py --workflow /absolute/workflow` proves this chain in an isolated temporary fixture with clearly simulated dates and observations. It calls the actual existing observation formatter, queue planner, ledger writer and trial arbiter. The fixed evaluator drives an executable synthetic recovery fixture. A single bounded policy change restores transient recovery, an authorization regression is rejected despite a journey gain, conflicting dependency behavior is rejected, and one measurement ends inconclusive. The evaluator and candidate digests remain fixed. Undo restores the baseline behavior, and reapplication restores the retained fixture. No production source or user data participates.

Run `GYF_WORKFLOW_ROOT=/absolute/workflow node --test tests/self-measure.test.mjs` for consumer checks and that integration drill. Without Workflow, the integration case is explicitly skipped. These synthetic results prove mechanics only. They are not production outcome, elapsed-retention, deployment or self-improvement claims.
