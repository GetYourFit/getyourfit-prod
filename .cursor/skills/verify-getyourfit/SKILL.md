---
name: verify-getyourfit
description: Use when verifying GetYourFit in a real browser, changing a user path, or diagnosing accounts, wardrobe photos, outfits, corrections, or data controls.
---

# Verify GetYourFit

Read [the feature map](features/README.md), then read the guide for each user path you exercise. The guides come from `src/verification/features.json`; edit that source and run `npm run feature-map` when a path changes.

## Start

Run `npm install` once. Set a stable random `BETTER_AUTH_SECRET` of at least 32 characters and retain it with its database. Start `npm run dev` (SQLite in a git-ignored data directory); `npm run dev:db` plus an exported `DATABASE_URL` switches to Postgres. Open `http://127.0.0.1:5173`; the local service listens at `http://127.0.0.1:4174`. Run `npm run verify` and continue when both services report `ready`.

For v0.1 account coverage, `npm run verify:local-account` builds and starts a production service, isolated database, and named Chrome session. It proves signup without email confirmation, consent, the email-reset notice, signed-in password change, restart continuity, sign-in failure, export, and deletion. Follow the [account guide](features/account-access.md) for the manual path. The account verifiers stop only their own processes and remove their temporary databases.

For the wardrobe-to-outfit path, run `npm run verify:wardrobe`. It uses the real licensed photographs in `tests/fixtures`, never remote photo assets or a seeded wardrobe. It drives photo consent, known-bad decode, manual confirmation, facts, one-question clarification, complete outfit and abstention, persisted rejection, export, cross-account isolation, restart, and deletion. Set `GYF_PROOF_DIR` outside the repository to retain screenshots and snapshots. For real model inference and recognition recovery, follow [photo recognition](../../../docs/photo-recognition.md#verify-recognition).

## Drive

Use `chrome-devtools-axi` and follow the selected guide:

1. Open `http://127.0.0.1:5173/` and take an accessible snapshot.
2. Use current generation-tagged element references to follow the visible user controls.
3. Capture both the action and resulting state. Inspect network requests when privacy or locality matters.
4. Confirm persisted effects through a second user view or the isolated database.

No email is sent: new accounts sign in immediately with an unverified address, and a forgotten password cannot be recovered. A signed-in user can change the password from Account.

## Evidence

Store screenshots, snapshots, and scratch data in the task data directory or an OS temporary directory. Keep those artifacts outside the repository. Update `docs/slice-1-acceptance.md` only for rows proven by the exact user flow. A screenshot without its triggering action is incomplete evidence.

The isolated verification scripts generate disposable random test passwords for each run. They do not require or accept a shared test password.

## Commands

- `npm run verify` refreshes feature guides and checks local readiness.
- `npm run feature-map` regenerates `FEATURE_MAP.md` and the browser recipes.
- `npm run verify:local-account` proves the default account journey in a production build.
- `npm run verify:wardrobe` proves the real photo, fact, outfit, correction, export, and deletion journey in a production build.
