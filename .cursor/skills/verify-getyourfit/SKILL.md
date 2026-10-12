---
name: verify-getyourfit
description: Use when verifying GetYourFit in a real browser, changing a user path, or diagnosing account and data-control behavior.
---

# Verify GetYourFit

Read [the feature map](features/README.md), then read the guide for each user path you exercise. The guides come from `src/verification/features.json`; edit that source and run `npm run feature-map` when a path changes.

## Start

Run `npm install` once. Set a stable random `BETTER_AUTH_SECRET` of at least 32 characters and retain it with its database. Start `npm run dev` with a disposable `GYF_DATA_DIR`. Open `http://127.0.0.1:5173`; the local service listens at `http://127.0.0.1:4174`. Run `npm run verify` and continue when both services report `ready`.

For v0.1 account coverage, `npm run verify:local-account` builds and starts a production service, isolated database, and named Chrome session. It proves signup without mail, consent, restart continuity, sign-in failure, export, and deletion. The preserved v0.2 path uses `npm run verify:auth` with a restricted test mailbox and controlled SMTP relay. Both verifiers stop only their own processes and remove their temporary databases.

## Drive

Use `chrome-devtools-axi` and follow the selected guide:

1. Open `http://127.0.0.1:5173/` and take an accessible snapshot.
2. Use current generation-tagged element references to follow the visible user controls.
3. Capture both the action and resulting state. Inspect network requests when privacy or locality matters.
4. Confirm persisted effects through a second user view or the isolated SQLite database.

Default v0.1 mode sends no email, signs new accounts in immediately, and retains an unverified email status. Recovery is unavailable. Opt-in SMTP sends through the configured service; only test mode keeps mail in memory. Its Node runner alone receives the ephemeral mailbox token and opens links in named browser sessions. Browser requests to `/__mail` return no messages. This account increment still requires photo and outfit work.

## Evidence

Store screenshots, snapshots, and scratch data in the task data directory or an OS temporary directory. Keep those artifacts outside the repository. Update `docs/slice-1-acceptance.md` only for rows proven by the exact user flow. A screenshot without its triggering action is incomplete evidence.

The isolated verification scripts generate disposable random test passwords for each run. They do not require or accept a shared test password.

## Commands

- `npm run verify` refreshes feature guides and checks local readiness.
- `npm run feature-map` regenerates `FEATURE_MAP.md` and the browser recipes.
- `npm run verify:auth` drives the account journey in isolated browser sessions.
- `npm run verify:local-account` proves the default account journey in a production build.
