---
name: verify-getyourfit
description: Use when verifying GetYourFit in a real browser, changing a user path, or diagnosing account and data-control behavior.
---

# Verify GetYourFit

Read [the feature map](features/README.md), then read the guide for each user path you exercise. The guides come from `src/verification/features.json`; edit that source and run `npm run feature-map` when a path changes.

## Start

Run `npm install` once, then start `npm run dev` with a disposable `GYF_DATA_DIR`. Open `http://127.0.0.1:5173`; the local service listens at `http://127.0.0.1:4174`. Run `npm run verify` and continue when both services report `ready`.

For authentication coverage, `npm run verify:auth` builds and starts its own production-mode service, isolated SQLite database, local mail catcher, and named Chrome sessions. It stops only processes it starts and removes its temporary database.

## Drive

Use `chrome-devtools-axi` and follow the selected guide:

1. Open `http://127.0.0.1:5173/` and take an accessible snapshot.
2. Use current generation-tagged element references to follow the visible user controls.
3. Capture both the action and resulting state. Inspect network requests when privacy or locality matters.
4. Confirm persisted effects through a second user view or the isolated SQLite database.

Verification and reset messages stay in process memory. Only `npm run verify:auth` receives an ephemeral token for mailbox access; its Node runner opens links in named browser sessions. Normal browser requests to `/__mail` return no messages. The current product path covers account access and account data control; wardrobe features are still pending.

## Evidence

Store screenshots, snapshots, and scratch data outside the repository under `/Users/rvzaku/firstmate/data/gyf-slice-1/` or an OS temporary directory. Update `docs/slice-1-acceptance.md` only for rows proven by the exact user flow. A screenshot without its triggering action is incomplete evidence.

## Commands

- `npm run verify` refreshes feature guides and checks local readiness.
- `npm run feature-map` regenerates `FEATURE_MAP.md` and the browser recipes.
- `npm run verify:auth` drives the account journey in isolated browser sessions.
