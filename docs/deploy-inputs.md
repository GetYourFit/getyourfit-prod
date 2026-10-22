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
| `DATABASE_URL` | Unset by default, which keeps SQLite. Set at cutover to the Supabase session pooler connection string (port 5432), injected from the vault as `SUPABASE_DATABASE_URL`; never a literal value in Git or logs. The server applies pending `migrations/` at startup |
| `BETTER_AUTH_SECRET` | A stable random key of at least 32 characters, injected from the vault; supply the vault reference and workload access, never a literal value in Git or logs |

Retain the secret with the database across releases and restores. Changing it invalidates sessions and makes existing authenticator secrets unreadable.

### Email

Email availability, recovery behavior, and API responses are owned by [Email](supabase.md#email). [Turning email on later](supabase.md#turning-email-on-later) records the setup steps.

`getyourfit.sqlite` holds accounts, wardrobe records, garment photos as BLOBs, private starter plans, and anonymous daily funnel counters (`funnel_counts`, read with `npm run funnel`; see the README). Supply a backup target and restore procedure preserving a consistent database and WAL state. The data directory has private permissions. Once `DATABASE_URL` is set the data lives in Postgres instead; the Supabase free plan has no point-in-time recovery or managed daily backups, so [Supabase](supabase.md#backups) records the backup and restore procedure the deployment owner runs. Source: [config](../server/config.mjs), [auth](../server/auth.mjs), [database](../server/database.mjs), and [wardrobe](../server/wardrobe.mjs).

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

After an authorized deployment to `app.getyourfit.co`, the deployment owner must use a real browser and the public API to verify the new zero-garment entry, save/reload, replace/reject, ownership confirmation, account isolation, and empty owned collection, then bind the evidence to the deployed revision. Do not call the feature live before that proof. If the release must be rolled back, restore the prior application revision using the existing service process and retain the same database and secret. The additive plan table and saved rows remain in the database for a later forward release; the prior owned-clothes journey remains available. Account deletion continues to cascade through plans.
