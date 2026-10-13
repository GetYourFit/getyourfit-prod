# Slice 1 deployment inputs

Target `https://app.getyourfit.co` with email/password signup without real mail, real garment photos, and one factual outfit decision from owned clothes. Public routing needs the change below before this local service can serve that address.

## Host and release

Supply a Linux host running Node.js 24, a service identity with vault access, a durable writable data directory, and HTTPS ingress reaching the loopback listener. Linux uses wearer-confirmed facts without Apple Vision; the macOS Swift cold-start finding is deferred to v0.2.

Use an exact `main` revision with successful `quality` and `acceptance` checks. Build with `npm ci` and `npm run build`, then run `npm start`. Keep `server/`, `shared/`, package manifests, runtime dependencies, and `dist/` together.

## Runtime inputs

| Input | Required value or owner |
| --- | --- |
| `NODE_ENV` | `production`, also set by `npm start` |
| `BETTER_AUTH_URL` | `https://app.getyourfit.co` |
| `GYF_PORT` | A chosen loopback port from 1 through 65535, matching the ingress upstream; the default is 4174 |
| `GYF_DATA_DIR` | A persistent directory outside the release checkout, writable by the service identity |
| `BETTER_AUTH_SECRET` | A stable random key of at least 32 characters, injected from the vault; supply the vault reference and workload access, never a literal value in Git or logs |
| `GYF_MAIL_TRANSPORT` | `disabled`; signup signs in immediately, while email verification and password recovery are unavailable |

Retain the secret with the database across releases and restores. Changing it invalidates sessions and makes existing authenticator secrets unreadable. Real-mail credentials are unnecessary for v0.1.

`getyourfit.sqlite` holds accounts, wardrobe records, and garment photos as BLOBs. Supply a backup target and restore procedure preserving a consistent database and WAL state. The data directory has private permissions. Source: [config](../server/config.mjs), [auth](../server/auth.mjs), and [database](../server/database.mjs).

## Public request boundary

[server/index.mjs](../server/index.mjs) permits only loopback Host and Origin values and binds to `127.0.0.1`. `BETTER_AUTH_URL` and `GYF_ALLOWED_ORIGINS` update Better Auth's trusted origins, but not that HTTP guard. A loopback production-service probe with both settings returned 200 for the local session route and 403 for the public Host or Origin headers.

Configure explicit public Host and Origin allowlists, retain foreign-origin rejection, and define trusted ingress hops for client-IP rate limits. Preserve secure cookies over HTTPS and review local-storage wording for server-hosted storage. Do not rewrite browser Origin headers to bypass the guard.

Verify signup, session continuity, real photo upload and refresh, an owned-outfit result, cross-user isolation, and no mail through the public HTTPS browser path. `npm run acceptance` starts its own isolated local service and cannot verify a deployed URL. Keep both required checks bound to the release revision; [workflow-kit.md](workflow-kit.md) records protection.
