## Intent

GetYourFit must run on production-grade data infrastructure for users worldwide, not a SQLite file on one Mac. This change adds an opt-in Postgres data layer (Supabase, free plan, Mumbai) beside the default SQLite while keeping Better Auth, and, on the captain's decision, removes the separate mail service: email confirmation is off and password reset says honestly that email reset is not available yet. [Supabase](../docs/supabase.md) owns the project facts, free-plan limits, keep-alive plan, the Supabase Auth versus Better Auth evaluation, and the exact steps to turn email on later.

## Observable result

With `DATABASE_URL` unset nothing about storage changes: the SQLite file in `GYF_DATA_DIR` is used and a database written by the previous release opens unchanged. With it set, accounts, wardrobe records, garment photos and starter plans are stored in Postgres through versioned [migrations](../migrations). A new wearer signs up and uses the app immediately. Forgot password? explains that reset links cannot be emailed yet, and a signed-in wearer changes their password from Account. Login, photos, outfits, export and deletion behave as before.

## Check

Run `npm run build`, `npm run lint`, `npm test`, `npm run test:ui`, `npm run acceptance:stubs --prefix tests/acceptance`, `npm run acceptance`, `npm run acceptance:postgres`, `npm run verify:local-account` and `npm run verify:wardrobe`. The server tests run against both SQLite and a real Postgres 17 (embedded locally, a service container in CI). Repeat each browser verifier with `GYF_VERIFY_BACKEND=postgres node scripts/with-postgres.mjs npm run <verifier>`. The Linux screenshot baselines for the sign-in, sign-up and account pages change with this interface and must be regenerated in CI's pinned Playwright image.

## Enforcement matrix row

| Requirement | Behavior | Required check | Evidence |
| --- | --- | --- | --- |
| R4 / A-1 | Account creation and sign-in without email, on both backends | `tests/http-boundary.test.mjs`, `tests/account.test.mjs`, `tests/legacy-sqlite.test.mjs`, production acceptance, `verify:local-account` | Exact-head acceptance `report.json` and the browser verifier output |
| R24 | Garment records carry provenance and cascade deletion in both backends | `tests/database.test.mjs`, `tests/account.test.mjs`, `verify:wardrobe` | Cascade and row-count assertions, export and deletion in a real browser |

## Known-bad test

`tests/database.test.mjs` rejects a migration edited after it was applied, a failing migration that would leave half a schema, drift between the migrations and the installed Better Auth, and any table the Supabase Data API roles can read or write. The existing acceptance known-bad variants remain mandatory.

## Deletes or replaces

Replaces nothing in the default storage path: SQLite and `GYF_DATA_DIR` stay, `DATABASE_URL` is the opt-in. Removes the SMTP transport, the mock mailbox, verification and reset tokens, and their tests and verifiers (`verify:auth` was already failing before this change). No cutover is performed: Postgres is used only where an operator sets `DATABASE_URL`, which a later change documents as the cutover runbook.
