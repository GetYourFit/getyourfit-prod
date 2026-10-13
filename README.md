# GetYourFit

GetYourFit is a private, local-first wardrobe companion: add real garment photos, confirm their facts, and get one complete explained set for a stated occasion from clothes you own. “You already own it” is a useful result. This v0.1 increment connects local accounts, garment review, a compact wardrobe, a factual outfit check, wearer corrections, export, and deletion. It is a local browser path, not a deployed service or a validated style or fit model.

Create an adult account with email and password, then add your own garment photos with permission. The browser resizes and strips metadata before local processing. On macOS with Swift installed, Apple Vision supplies a fallible clothing label with its revision and confidence; elsewhere the app explicitly asks you to confirm the facts yourself. Every outfit fact comes from the wearer. The app requires an occasion, weather, dress code, availability, and confirmed fit; it asks one question when a required fact is unknown and abstains when no complete set exists. A rejected item stays excluded for the same context until you allow it again.

The v0.1 default sends no email and allows sign-in with an unverified address. Email verification and password recovery are sequenced for v0.2. Privacy controls export photos and facts with provenance and corrections, or delete them with the account. There is no sharing, external recognition service, body inference, buying flow, or seeded wardrobe.

## Run locally

Requirements: Node.js 22.18 or later. Local Apple Vision classification additionally needs macOS and the Swift toolchain; classification failures are shown honestly and never replaced by fabricated labels.

Set `BETTER_AUTH_SECRET` to a random key of at least 32 characters from your local secret store. Generate it once, retain it with the database, and reuse it on every restart. Changing it invalidates sessions and makes existing authenticator secrets unreadable. The server refuses startup without this key before opening the database. You can generate a key with `node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))'`; store its output privately, outside the repository.

Email delivery defaults to `GYF_MAIL_TRANSPORT=disabled`. Signup creates a session immediately, keeps `emailVerified=false`, and recovery endpoints are unavailable. Keep your password safe; this version cannot email a reset link.

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Run `npm run verify:local-account` to prove the default account path in a production build with a disposable database and random key. It checks consent, signup without mail, wrong-password failure, restart continuity, export, and deletion through real browser controls.

The preserved v0.2 email path is opt-in: set `GYF_MAIL_TRANSPORT=smtp`, `SMTP_HOST`, and `SMTP_FROM`. `SMTP_PORT` defaults to `587`; `SMTP_SECURE` defaults to true on port `465` and false otherwise. Non-implicit TLS connections require STARTTLS. Set both `SMTP_USER` and `SMTP_PASS` when authentication is required. No provider credentials are configured here. `npm run verify:auth` uses an isolated runner-only in-memory catcher and a controlled local SMTP relay to test this path. Neither sends real email or proves provider delivery. Browser requests to `/__mail` return no messages in default or SMTP mode.

## Check

```sh
npm run lint
npm run build
npm test
npm run verify
npm run verify:auth
npm run verify:local-account
npm run verify:wardrobe
npm run acceptance
```

## Product and design decisions

- [Product contract](docs/PRODUCT.md) records product purpose, constraints, and first-slice outcome.
- [DESIGN.md](DESIGN.md) records the interface system.
- [docs/product-decisions.md](docs/product-decisions.md) records what was kept, merged, and removed from earlier GetYourFit repositories.
- [Requirements](docs/requirements.md) tracks R1-R37 and A-1 without dropping deferred work.
- [Acceptance matrix](docs/slice-1-acceptance.md) records the slice's end-to-end gates and evidence status.
- [Evidence ledger](docs/evidence-ledger.md) records research, decisions, and observed results.
- [Feature map](FEATURE_MAP.md) links to generated account, wardrobe, outfit, and data-control browser guides.
- [Workflow kit](docs/workflow-kit.md) records the pinned adoption, CI checks, and product acceptance hook.
- [Deployment inputs](docs/deploy-inputs.md) records host, vault, storage, and public-origin requirements for the deployment item.

`npm run verify:wardrobe` builds the production app and drives real signup, photo permission, invalid-image rejection, the licensed photographs in [tests/fixtures](tests/fixtures/README.md), facts and correction, outfit clarification and abstention, cross-account isolation, export, restart, and deletion. Set `GYF_PROOF_DIR` to a directory outside the repository to retain screenshots, snapshots, and network evidence. The verifier selects a free ephemeral loopback port with `GYF_PORT` and owns only its disposable data and named browser session. It never stops another worktree's listener.
