# Slice 1 deployment inputs

Target `https://app.getyourfit.co` with email/password signup without real mail, real garment photos, and one factual outfit decision from owned clothes. Public routing requires the operator configuration below.

## Host and release

Supply a Linux host running Node.js 24, a service identity with vault access, a durable writable data directory, and HTTPS ingress reaching the loopback listener. Linux uses wearer-confirmed facts without Apple Vision; the macOS Swift cold-start finding is deferred to v0.2.

Use an exact `main` revision with successful `quality` and `acceptance` checks. Build with `npm ci` and `npm run build`, then run `npm start`. Keep `server/`, `shared/`, package manifests, runtime dependencies, and `dist/` together.

## Runtime inputs

| Input | Required value or owner |
| --- | --- |
| `NODE_ENV` | `production`, also set by `npm start` |
| `BETTER_AUTH_URL` | `https://app.getyourfit.co` |
| `GYF_ALLOWED_ORIGINS` | Optional comma-separated additional HTTPS origins; omit for a single same-origin deployment |
| `GYF_TRUSTED_PROXIES` | Comma-separated ingress IP addresses or narrow CIDRs; empty trusts no forwarded client addresses |
| `GYF_PORT` | A chosen loopback port from 1 through 65535, matching the ingress upstream; the default is 4174 |
| `GYF_DATA_DIR` | A persistent directory outside the release checkout, writable by the service identity |
| `BETTER_AUTH_SECRET` | A stable random key of at least 32 characters, injected from the vault; supply the vault reference and workload access, never a literal value in Git or logs |
| `GYF_MAIL_TRANSPORT` | `disabled`; signup signs in immediately, while email verification and password recovery are unavailable |

Retain the secret with the database across releases and restores. Changing it invalidates sessions and makes existing authenticator secrets unreadable. Real-mail credentials are unnecessary for v0.1.

`getyourfit.sqlite` holds accounts, wardrobe records, and garment photos as BLOBs. Supply a backup target and restore procedure preserving a consistent database and WAL state. The data directory has private permissions. Source: [config](../server/config.mjs), [auth](../server/auth.mjs), and [database](../server/database.mjs).

## Public request boundary

[server/config.mjs](../server/config.mjs) shares one Origin allowlist between the HTTP guard and Better Auth: loopback defaults, `BETTER_AUTH_URL`, and explicit `GYF_ALLOWED_ORIGINS`. The Host allowlist contains the API loopback addresses and the host of `BETTER_AUTH_URL`; additional allowed origins do not authorize extra Host values. Non-loopback origins require HTTPS. Credentials, paths, queries, fragments, and wildcards are refused at startup.

[server/index.mjs](../server/index.mjs) still binds to `127.0.0.1`. Ingress must reach that listener in the same network namespace, preserve the configured public Host and browser Origin, and terminate HTTPS. Foreign Hosts and Origins remain forbidden; writes require an allowed Origin. Session cookies retain Secure, HttpOnly, and SameSite=Lax.

Set `GYF_TRUSTED_PROXIES` only to the addresses of controlled ingress hops, never a hop count, wildcard, or subnet containing clients. The service walks the forwarding chain from its socket peer, stopping at the first untrusted address. Both application and Better Auth limits use that client address; arbitrary client IP headers cannot override it. Ingress must remove spoofed incoming forwarding headers or append the actual client address, and direct access to the backend must remain restricted. Review local-storage wording for server-hosted storage before release.

`npm test` exercises the real production HTTP service on free ports with disposable databases and per-run credentials: loopback and public requests, foreign rejection, secure signup cookies, forwarding spoof resistance, separate ingress clients, and invalid startup configuration.

Verify signup, session continuity, real photo upload and refresh, an owned-outfit result, cross-user isolation, and no mail through the public HTTPS browser path. `npm run acceptance` starts its own isolated local service and cannot verify a deployed URL. Keep both required checks bound to the release revision; [workflow-kit.md](workflow-kit.md) records protection.
