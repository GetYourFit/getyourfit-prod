# Supabase

GetYourFit runs on a SQLite file by default. Setting `DATABASE_URL` opts in to Postgres, and production will point it at one free-plan Supabase project at cutover. Nothing changes for a deployment that leaves `DATABASE_URL` unset. Nothing here is a credential: connection strings, the database password and API keys live only in the Automic Vault.

## The project

| Fact | Value |
| --- | --- |
| Organization | GYF org (`byhzcppqmefbneurqhfc`), plan `free` |
| Project | `getyourfit`, ref `vflknkjgipfgdvdvwleh`, created 2026-10-19 |
| Region | `ap-south-1` (Mumbai), India first |
| Postgres | 17 (the embedded Postgres used by `npm test` is also 17) |
| Cost | Zero. No paid plan, no second project, no add-ons |

Vault entries (injected with `av inject +NAME -- command`, never printed or committed):

| Name | Holds |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Management API token for the organization |
| `SUPABASE_DB_PASSWORD` | Generated database password |
| `SUPABASE_DATABASE_URL` | Session pooler connection string, the app's `DATABASE_URL` |
| `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Project API keys (the secret key is for server-side Storage use only) |

## Connecting

The app uses the **session pooler**, `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>`:

- The direct host `db.<ref>.supabase.co` is IPv6-only on the free plan, and most hosts (including the development Mac) have no IPv6 route.
- The transaction pooler (port 6543) does not support session state such as the advisory lock the migration runner takes.

TLS is always verified. [`server/certs/supabase-root-2021-ca.crt`](../server/certs/supabase-root-2021-ca.crt) is Supabase's public root CA (valid to 2031-04-26, from `supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`); it is used automatically for `*.supabase.com` and `*.supabase.co` hosts. `GYF_DATABASE_CA_FILE` supplies another CA, and `GYF_DATABASE_SSL=disable` is only for a loopback database. `GYF_DATABASE_POOL_SIZE` (default 10) must stay well under the free plan's connection limits.

## Schema and migrations

With `DATABASE_URL` set, the schema is the SQL in [`migrations/`](../migrations), applied in name order at server start (`npm run migrate` runs them alone). Each file runs in one transaction under an advisory lock, so two instances starting together cannot collide, and a file edited after it was applied is refused: add a new migration instead. `schema_migrations` records names and checksums.

- `0001_initial.sql` holds the Better Auth tables (generated from the options in `server/auth.mjs`, then pinned) and the app tables. `tests/database.test.mjs` fails if the installed Better Auth expects a different schema, so a Better Auth upgrade that changes tables surfaces as a failing test and a new migration.
- `0002_lock_down_data_api.sql` enables row level security on every table and revokes all privileges from Supabase's `anon` and `authenticated` roles, including future tables. Supabase exposes `public` tables through its Data API by default; the app reaches Postgres only through its own server connection (which bypasses RLS), so the Data API must see nothing. A test creates those roles with Supabase's default grants and proves they can read and write nothing.

The SQLite schema is unchanged and still created in code (`server/db/sqlite.mjs`) with Better Auth's own migration, so an existing `getyourfit.sqlite` keeps working; `tests/legacy-sqlite.test.mjs` opens a file written by the release before this work. Both drivers sit behind one `query(text, values)` interface using `$1` placeholders and the SQL subset the two databases share.

Garment photos are still stored in the database (`bytea` or BLOB). Moving them to Supabase Storage is the next stage.

## Development and tests

- `npm run dev:db` starts a persistent local Postgres 17 under `.gyf-data/postgres` and prints the `DATABASE_URL` to export before `npm run dev`.
- `npm test` runs the HTTP, account and wardrobe tests against both SQLite and Postgres. `scripts/with-postgres.mjs` starts a throwaway embedded Postgres 17 or uses `GYF_TEST_DATABASE_URL`, which CI sets to a service container. Each test gets its own database.
- `npm run test:ui`, `npm run acceptance` and the `verify:*` scripts use isolated SQLite files by default. `npm run acceptance:postgres` checks Postgres. To run either browser verifier against Postgres, use `GYF_VERIFY_BACKEND=postgres node scripts/with-postgres.mjs npm run verify:local-account` or replace the final script with `verify:wardrobe`.

## Free-plan limits and keep-alive

Limits as published on 2026-10-19 ([billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits)). Re-check before relying on them.

| Limit | Free plan | What it means here |
| --- | --- | --- |
| Database size | 500 MB per project | Photos are the bulk. A 1200 px JPEG is roughly 150 to 300 KB, so the cap is a few thousand garments across all users. Watch it before launch campaigns |
| File storage | 1 GB, 50 MB per file | Roomier than the database. Moving photos to Storage frees the 500 MB for rows |
| Egress | 5 GB | Photos are served through the app, which counts |
| Monthly active users | 50,000 | Not binding |
| Free projects | 2 per owner across organizations | Keep one project |
| Inactivity | Paused after about 7 days of low activity | An unattended project goes offline |
| Restore after pause | The docs state both 90 days and 1 year | Treat 90 days as the safe figure |
| Backups, point-in-time recovery | None managed for free projects | See [Backups](#backups) |

**Keep-alive plan.** A paused project is an outage, so activity must never lapse:

1. Before cutover (an empty project gets no traffic): run `av inject +SUPABASE_DATABASE_URL -- sh -c 'DATABASE_URL=$SUPABASE_DATABASE_URL node scripts/keepalive.mjs'` daily from a launchd or cron job on the operator's machine. It issues one query and prints `keepalive ok`.
2. From cutover: real users generate activity, and a monitor (or a cron `curl`) calls `GET https://app.getyourfit.co/api/health` at least daily. That endpoint runs `SELECT 1` and answers 503 when the database is unreachable, so the same check is the outage alarm.
3. If the project is ever paused, restore it from the Supabase dashboard (or `POST /v1/projects/{ref}/restore` with the Management API token). The data is intact; the app reconnects without a deploy.

Upgrading to Pro removes pausing and adds daily backups and larger limits. That is a paid change and needs the captain's approval.

## Backups

The free plan keeps no managed backups. Until the export tooling lands (next stages), take a logical dump with PostgreSQL 17 client tools from a machine that can reach the session pooler: `av inject +SUPABASE_DATABASE_URL -- sh -c 'pg_dump --format=custom --no-owner "$SUPABASE_DATABASE_URL" > getyourfit-$(date +%F).dump'`, and store the file outside the repository. Restore with `pg_restore --clean --if-exists --no-owner -d "$TARGET_URL"`. Record the date of the last verified restore here when one is done.

## Supabase Auth or Better Auth

**Decision: keep Better Auth on Postgres for the ten-day window.** Supabase Auth is not clearly lower risk, and it is higher risk in four ways that matter now.

1. **Existing accounts cannot be moved without email.** Passwords are Argon2id hashes in `account.password`, and TOTP secrets are encrypted with `BETTER_AUTH_SECRET`. Importing them into Supabase Auth needs hash-format support that the [password guide](https://supabase.com/docs/guides/auth/passwords) does not document, and authenticator secrets could not move at all, so users would re-enrol. Falling back to forced password resets is impossible because email delivery does not work (next point).
2. **Supabase's own email does not reach users.** The [built-in SMTP](https://supabase.com/docs/guides/auth/auth-smtp) delivers only to addresses on the organization's team, at 2 messages per hour with no SLA. Reaching real users needs a custom SMTP provider, exactly the third-party mail service the captain removed. So Supabase Auth would also run with email confirmation off and no reset, giving no capability gain.
3. **It is a rewrite of the most sensitive path.** `requireUser`, the 18+ sign-up hook, lockout, rate limits, 2FA UI, `sign-out-everywhere`, the cookie settings and every test and browser verifier assume Better Auth sessions. Redoing them in a ten-day window trades a working, tested login for a new one.
4. **It does not buy per-user storage rules.** Supabase Storage policies key on `auth.uid()` from a Supabase Auth JWT, but the browser only needs the app. Photos stay in a private bucket that only the server touches (secret key), with ownership checked by the server and objects named `<user id>/<garment id>`, which gives the same guarantee.

What would change the decision: a mail provider becoming acceptable (then Supabase Auth's hosted email flows become attractive) or a need for social login. User ids are plain text keys in `"user"`, so moving later is a data migration, not a redesign.

## Email

Email is off. There is no mail code, no SMTP setting, and no third-party mail provider anywhere:

- Sign-up needs no confirmation: the account is usable immediately and `emailVerified` stays false.
- `/api/auth/request-password-reset`, `forget-password`, `reset-password`, `send-verification-email`, `verify-email` and `change-email` answer 503 `EMAIL_NOT_AVAILABLE` (404 for GET).
- Forgot password? says reset links cannot be emailed yet. Recovery is Account > Change password while signed in (current password required; other devices are signed out). A wearer who has lost both password and session cannot recover the account.
- Because nothing proves who owns an address, sign-up reports "already exists" for a registered email. This is the accepted cost of confirmation being off.

### Turning email on later

Docs only; nothing below is implemented.

1. Pick the provider. The existing path is SMTP through the captain's Gmail account with the vault entries `GYF_SMTP_HOST`, `GYF_SMTP_USER`, `GYF_SMTP_PASS` and `GYF_MAIL_FROM` (port 587 with STARTTLS required). A provider named later fits the same four values.
2. Restore the transport from history: `git show ef2860f:server/mail.mjs` (and `tests/mail-transport.test.mjs`) is the reviewed SMTP wrapper; re-add `nodemailer`.
3. In `server/auth.mjs` add `emailVerification.sendVerificationEmail` and `emailAndPassword.sendResetPassword` calling that transport, and only then set `requireEmailVerification: true`.
4. **Existing accounts have `emailVerified = false`.** Requiring verification would lock all of them out. First send verification mails to everyone (or backfill `emailVerified = true` for accounts that have used the app, which is a product decision) before enabling the requirement.
5. Remove the `emailRoutes` block in `server/index.mjs`, restore the Forgot password? form and a reset screen in `src/AuthGate.tsx`, and add browser coverage for verification and reset against a real SMTP test server.
6. If Supabase Auth is ever adopted instead, custom SMTP is set with `PATCH https://api.supabase.com/v1/projects/vflknkjgipfgdvdvwleh/config/auth` (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`, `external_email_enabled`) and confirmation is controlled by `mailer_autoconfirm`.

## Migration status

| Stage | Status |
| --- | --- |
| 1. Free-tier project in Mumbai, secrets in the vault | Done |
| 2. Opt-in Postgres data layer beside the default SQLite, migrations, tests on both, Better Auth kept, email off | This change. Default runtime stays SQLite |
| 3. Garment photos in Supabase Storage with per-user access | Next |
| 4. Export of the SQLite data and rehearsed import | Next |
| 5. Rollback to SQLite and the cutover runbook | Next. Roll back by redeploying the last SQLite release (`ef2860f`) with its untouched `getyourfit.sqlite`; data written to Postgres after cutover needs the reverse export built in stage 4 |
