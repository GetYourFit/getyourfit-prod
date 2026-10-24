# Slice 1 deployment inputs

Target `https://app.getyourfit.co` with email/password signup without email confirmation, real garment photos, and one factual outfit decision from owned clothes. Public routing requires the operator configuration below.

## Host and release

Supply a Linux host running Node.js 24, a service identity with vault access, and HTTPS ingress reaching the loopback listener. The default database is a SQLite file in a durable data directory; the planned production database is Supabase Postgres, selected by `DATABASE_URL` at cutover (see [Supabase](supabase.md)), after which the host keeps no durable state. Linux needs no Swift or Apple Vision: browsers recognize garments on-device ([photo recognition](photo-recognition.md)), and the macOS Swift cold-start finding for the optional server path is deferred to v0.2.

Use an exact `main` revision with successful `quality` and `acceptance` checks. Build with `npm ci` and `npm run build`, then run `npm start`. Keep `server/`, `shared/`, package manifests, runtime dependencies, and `dist/` together.

## Runtime inputs

| Input | Required value or owner |
| --- | --- |
| `NODE_ENV` | `production`, also set by `npm start` |
| `BETTER_AUTH_URL` | `https://app.getyourfit.co` |
| `GYF_ALLOWED_ORIGINS` | Optional comma-separated additional HTTPS origins; omit for a single same-origin deployment |
| `GYF_TRUSTED_PROXIES` | Comma-separated ingress IP addresses or narrow CIDRs; empty trusts no forwarded client addresses |
| `GYF_PORT` | A chosen loopback port from 1 through 65535, matching the ingress upstream; the default is 4174 |
| `GYF_DATA_DIR` | A persistent directory outside the release checkout, writable by the service identity. Holds `getyourfit.sqlite` and is used only while `DATABASE_URL` is unset |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Optional, with `DATABASE_URL` only: store garment photos in a private Supabase Storage bucket instead of the database ([Photo storage](supabase.md#photo-storage)). The key comes from the vault and is never a literal in Git or logs |
| `DATABASE_URL` | Unset by default, which keeps SQLite. Set at cutover to the Supabase session pooler connection string (port 5432), injected from the vault as `SUPABASE_DATABASE_URL`; never a literal value in Git or logs. The server applies pending `migrations/` at startup |
| `BETTER_AUTH_SECRET` | A stable random key of at least 32 characters, injected from the vault; supply the vault reference and workload access, never a literal value in Git or logs |

Retain the secret with the database across releases and restores. Changing it invalidates sessions and makes existing authenticator secrets unreadable.

### Email

Email availability, recovery behavior, and API responses are owned by [Email](supabase.md#email). [Turning email on later](supabase.md#turning-email-on-later) records the setup steps.

`getyourfit.sqlite` holds accounts, wardrobe records, garment photos as BLOBs, private starter plans, and anonymous daily funnel counters (`funnel_counts`, read with `npm run funnel`; see the README). Supply a backup target and restore procedure preserving a consistent database and WAL state. The data directory has private permissions. Once `DATABASE_URL` is set the data lives in Postgres instead (and garment photos in a private Storage bucket when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are also set, see [Photo storage](supabase.md#photo-storage)); the Supabase free plan has no point-in-time recovery or managed daily backups, so [Supabase](supabase.md#backups) records the backup and restore procedure the deployment owner runs. Source: [config](../server/config.mjs), [auth](../server/auth.mjs), [database](../server/database.mjs), and [wardrobe](../server/wardrobe.mjs).

## Public request boundary

[server/config.mjs](../server/config.mjs) shares one Origin allowlist between the HTTP guard and Better Auth: loopback defaults, `BETTER_AUTH_URL`, and explicit `GYF_ALLOWED_ORIGINS`. The Host allowlist contains the API loopback addresses and the host of `BETTER_AUTH_URL`; additional allowed origins do not authorize extra Host values. Non-loopback origins require HTTPS. Credentials, paths, queries, fragments, and wildcards are refused at startup.

[server/index.mjs](../server/index.mjs) still binds to `127.0.0.1`. Ingress must reach that listener in the same network namespace, preserve the configured public Host and browser Origin, and terminate HTTPS. Foreign Hosts and Origins remain forbidden; writes require an allowed Origin. Session cookies retain Secure, HttpOnly, and SameSite=Lax.

Set `GYF_TRUSTED_PROXIES` only to the addresses of controlled ingress hops, never a hop count, wildcard, or subnet containing clients. The service walks the forwarding chain from its socket peer, stopping at the first untrusted address. Both application and Better Auth limits use that client address; arbitrary client IP headers cannot override it. Ingress must remove spoofed incoming forwarding headers or append the actual client address, and direct access to the backend must remain restricted. Review local-storage wording for server-hosted storage before release.

IP abuse budgets run before body parsing, authentication checks, and disabled-email responses. [Authentication](../server/index.mjs) has a shared IP budget plus route-specific budgets. [Wardrobe](../server/wardrobe.mjs) uploads and photo reviews share budgets; other writes, including outfit checks, corrections, and starter plans, share separate budgets. Wardrobe IP budgets cover unauthenticated attempts, and authenticated writes also consume account budgets. [Funnel](../server/funnel.mjs) attempts consume an IP budget even when the event is invalid. These implementations own the current thresholds.

The [limiter](../server/rate-limit.mjs) keeps bounded, fixed-window counters in process memory and resets them on restart. It does not persist IP addresses. Exhausted budgets or full counter storage return HTTP 429 with `Retry-After` in seconds. Before adding server replicas, enforce equivalent shared limits at ingress. Better Auth's database-backed limits remain enabled separately.

Responses deny framing through CSP and `X-Frame-Options: DENY`. `Permissions-Policy` disables camera, microphone, geolocation, payment, and USB access; garment photos still use file selection.

`npm test` exercises the real production HTTP service on free ports with disposable Postgres databases and per-run credentials: loopback and public requests, foreign rejection, secure signup cookies, forwarding spoof resistance, separate ingress clients, and invalid startup configuration.

Verify signup, session continuity, real photo upload and refresh, an owned-outfit result, and cross-user isolation through the public HTTPS browser path. Check that Forgot password? says email reset is unavailable and that Account > Change password works. `npm run acceptance` starts its own isolated local service and cannot verify a deployed URL. Keep both required checks bound to the release revision; [workflow-kit.md](workflow-kit.md) records protection.

## Starter-plan release handoff

The starter plan uses the existing database and account session. Its table is additive and references the account with cascade deletion. Shopping links load from the bundled source record without a runtime Cuelinks API key. Source maintenance and permissions are owned by [shopping sources](shopping-sources.md). The owned-clothes path remains beside the new path.

After this change is reviewed and merged, the existing deployment owner can build the exact approved `main` revision with `npm ci`, `npm run build`, and `npm run acceptance`, then use the established `npm start` service process and runtime inputs above. The acceptance command builds and runs a disposable production service; it does not deploy or prove a public host. Keep the same database, `BETTER_AUTH_SECRET`, and service configuration. Before an authorized rollout, take the deployment owner's normal consistent database backup and record the prior release revision.

After an authorized deployment to `app.getyourfit.co`, the deployment owner must use a real browser and the public API to verify the new zero-garment entry, save/reload, replace/reject, ownership confirmation, account isolation, and empty owned collection, then bind the evidence to the deployed revision. Do not call the feature live before that proof. If the release must be rolled back, use the compatible application revision below and retain the same database and secret. The additive plan table and saved rows remain in the database. Account deletion continues to cascade through plans.

## Identify and check a release

`npm run build` writes `dist/release.json` after Vite completes. It records the full Git revision and whether the worktree had changes. Keep this file with the built assets. `GET /api/release` serves that identity without authentication or caching. The server reads it at startup, so an old process cannot report a newly built release. Missing or invalid metadata returns 503. The response contains no host, path, environment, account, or credential data.

From a clean checkout, build the exact merged revision that passed `quality` and `acceptance`. Run the read-only check against the candidate before rollout:

```sh
node scripts/check-release.mjs http://127.0.0.1:PORT FULL_COMMIT_SHA
```

The check requires the exact revision, `modified: false`, database health, and an HTML public page. Each of its three requests has a ten-second timeout. Redirects fail. This check cannot prove signup, saved-look continuity, photo recognition, or outfit behavior. Verify those with a real browser and isolated accounts on the same candidate.

Production changes remain the deployment owner's responsibility. The existing helper automatically rolls back to the checkout that preceded its invocation. Before deploying the release-identity candidate, establish and publicly verify the merged baseline `1bf4224f678304fc530d1efa30688992c52b81de` through that same helper. This baseline contains the authentication and shared upload budgets and retains security headers on errors. The [current isolated recovery receipt](evidence/release-recovery-security-2026-10-22.json) binds its ancestry, build, compatibility, and security checks to that exact revision. Confirm a clean release checkout and verify the public browser's saved-look and owned-outfit paths. This baseline predates `/api/release`, so compare its built assets with its exact clean build as well. Do not deploy the candidate directly from an older checkout: the helper would retain that older checkout as its automatic rollback target.

After the compatible baseline is established, the authorized operator uses the helper with the exact merged, tested candidate SHA:

```sh
~/.local/state/getyourfit/deploy.sh FULL_COMMIT_SHA
node scripts/check-release.mjs https://app.getyourfit.co FULL_COMMIT_SHA
```

For an authorized application rollback, run `~/.local/state/getyourfit/deploy.sh 1bf4224f678304fc530d1efa30688992c52b81de` and verify the public browser and built assets again. Keep the same database and secret. Never use `b6977251d5da58b88718005a9ccca02412ea3c63` as a current baseline or rollback target: its historical data-compatibility result predates the security hardening.

The existing helper's HTTP 200 probe does not establish release identity. Treat the second command as mandatory before recording a successful release. Do not deploy an unmerged revision. Retain the current database, auth secret, runtime configuration, and prior application revision. This release does not authorize a database cutover, a restart by a validation worker, or changes to `getyourfit.co`.

## Rehearse application rollback and SQLite restoration

Use disposable test accounts and a private scratch directory. Keep the production database and secret out of the rehearsal.

1. Start the candidate with its own `GYF_DATA_DIR`, a generated test secret, and an unused loopback port. Leave `DATABASE_URL` unset. Complete signup, chosen-look save/reload, photo upload, and an owned-outfit check.
2. Use SQLite's online backup API or `sqlite3 SOURCE '.backup BACKUP'` against that isolated database. Check `PRAGMA integrity_check` on the backup. Retain the test secret separately from the proof report.
3. Stop only the disposable candidate process. Run the selected merged, security-preserving rollback revision against a separate copy of the backup, with the same test secret and another unused port. Verify signin, garment photos, saved-plan reads, export equality, and the owned-outfit response. Check authentication budgets, shared upload/review budgets before parsing, and security headers on error responses. Preserve additive tables and rows. Never restore a database merely to roll back application code.
4. Copy the backup to another empty private data directory. Start the candidate there with the same test secret. Verify signin, saved look, original photo bytes, and outfit behavior again, including correction/reset. Check database integrity, compare the exported test records, and repeat the security controls on the candidate runtime.
5. Stop the disposable processes. Commit a sanitized report with the exact backup-source, candidate, and rollback revisions, backup integrity, browser results, and compatibility limits. Link the report from this runbook. Keep backups, credentials, account identities, photos, local paths, and raw dumps outside the repository.

This procedure covers the current SQLite runtime. Postgres backup and cutover procedures belong to [Supabase](supabase.md). The Mac tunnel remains dependent on one machine being awake and connected; local validation does not establish global production availability.

### Current recovery evidence

The [security-preserving recovery receipt](evidence/release-recovery-security-2026-10-22.json) records a new isolated rehearsal of candidate `6afda4c3ef591c9a17d331a7b9e4e44737448afd` and merged baseline `1bf4224f678304fc530d1efa30688992c52b81de`. It records live `main` resolution and ancestry, exact source and built-asset digests, the running candidate's release identity, SQLite online backup integrity, copied-backup rollback, and a separate candidate restoration. Its result fields describe actual checks, including full exported-record and photo-byte equality, browser signin and Look 4 continuity, the owned-outfit response, correction/reset, and authentication, upload-budget, and error-header negative controls. The receipt is valid only when its overall result and every recorded check pass.

These inputs use disposable synthetic accounts and the [licensed garment fixtures](../tests/fixtures/README.md). The receipt covers local production builds and SQLite recovery. It does not establish production deployment, global availability, Postgres restoration, or new photo-classification accuracy. Normal independent quality and acceptance checks remain required at the resulting release head.

The tested candidate precedes this documentation and evidence update. To establish equivalence after a documentation-only successor is committed, run:

```sh
git diff --exit-code 6afda4c3ef591c9a17d331a7b9e4e44737448afd HEAD -- . ':(exclude)docs/**' ':(exclude)*.md'
```

The receipt also compares every tracked non-documentation input in the tested snapshots with its Git blob and the working copy. This includes server and browser source, shared schemas, migrations, public assets, package manifests and lockfile, build configuration, scripts, tests, and CI configuration. An executable-input difference requires a new recovery rehearsal. Documentation equivalence does not make the historical build report a new SHA: after the final clean commit, build again and run the exact-release check against that commit's disposable service before rollout. Retain that check's result with release validation evidence, outside this document, to avoid a self-referential commit identity.

### Historical compatibility boundary (2026-10-21)

The [sanitized recovery report](evidence/release-recovery-2026-10-21.json) records the 2026-10-21 isolated SQLite results and digests of the original private records. Its `identities` object distinguishes the backup-source revision `4010add254ff602a16b7bc1aed8aaea9243f74e0` from the final tested candidate `7b31abed36090adaa01f82a88f1bf2ffc35b2819`.

The merged continuity revision `b6977251d5da58b88718005a9ccca02412ea3c63` passed against a separate copy of that backup. The report's `compatibleRollback` records signin, saved Look 4, account export, photo integrity for all three licensed fixtures, and an owned-outfit result matching the backup source. The browser snapshot recorded Look 4 selected and three garments. Database integrity passed, and the backup's SHA-256 stayed unchanged.

The older production checkout `c7f5720352d169f0e3281b1eff94d8772a6bc823` failed this compatibility check, recorded under `incompatibleRollback` in the [recovery report](evidence/release-recovery-2026-10-21.json). Its strict starter-plan input schema rejects `selectedLook`, causing saved-plan reads and account export to return HTTP 500. Do not use that revision as the rollback target after chosen looks have been saved. No schema weakening, plan-field deletion, database downgrade, or production restoration is needed.

The report's `initialRestoration` records exact exported-record and outfit equality after restoring a separate backup copy into `4010add254ff602a16b7bc1aed8aaea9243f74e0`. Its `finalRestoration` records the later check at `7b31abed36090adaa01f82a88f1bf2ffc35b2819`: signin, export, saved Look 4, original photo bytes, matching owned-outfit result, database integrity, and an unchanged backup. The final browser snapshot recorded Look 4 selected and three garments. `candidateAcceptance` retains the exact clean revision and all 12 passing cases from the production-build acceptance report.

These historical executions belong only to the revisions above. They precede the merged security hardening and cannot authorize the current runtime or its rollback target. The current recovery receipt is separate and does not relabel those results. The release owner must bind the eventual merged SHA to its own green checks, clean built release identity, and public visitor verification before recording deployment.
