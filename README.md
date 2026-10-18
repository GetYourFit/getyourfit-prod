# GetYourFit

GetYourFit is a private wardrobe companion: choose an explained outfit from clothes you own, or use [Build my wardrobe](#build-my-wardrobe) to plan clothing needs when starting without garments. "You already own it" is a useful result. This v0.1 increment connects local accounts, garment review, a compact wardrobe, a factual outfit check, starter plans, wearer corrections, export, and deletion. It is a local browser path, not a deployed service or a validated style or fit model.

For outfits from owned clothes, create an adult account with email and password, then add your own garment photos with permission. The browser resizes and strips metadata, then uploads the photo to your private account on the GetYourFit server, which classifies and stores it. On macOS with Swift installed, Apple Vision supplies a fallible clothing label with its revision and confidence; elsewhere the app explicitly asks you to confirm the facts yourself. Every outfit fact comes from the wearer. The owned-clothes outfit check requires an occasion, weather, dress code, availability, and confirmed fit; it asks one question when a required fact is unknown and abstains when no complete set exists. A rejected item stays excluded for the same context until you allow it again.

The v0.1 default sends no email and allows sign-in with an unverified address. Email verification and password recovery are sequenced for v0.2. Privacy controls export photos and facts with provenance and corrections, or delete them with the account. Photos and facts are never sold or used for model training. There is no sharing, external recognition service, body inference, buying flow, or seeded wardrobe.

## Build my wardrobe

Create or sign in to your GetYourFit account, then choose **Build my wardrobe** beside **Add garment**. Planning needs no garment upload or account at another service. The owned-clothes outfit path remains available.

Enter one occasion, a spending ceiling and currency (INR by default), and an outfit form. Add weather, dress code, and any clothing requirement you know. The result includes a starter capsule: two options for each top, bottom or one-piece role and one footwear piece, mixed into up to four explained looks, with a planning budget share per piece. Capsule looks and climate guidance are general suggestions, not a verified fit or a taste prediction. Confirm only roles for which you already have a suitable item. Choose **Make my starter plan** to review a draft, then **Save plan** to keep it in your private account. You can replace a planned need's text before or after saving. **Reject plan** discards an unsaved draft and returns to planning; rejecting a saved plan keeps it in history. **Replace plan** creates a new saved plan and marks the previous one replaced. **New plan** starts another occasion, and saved plan history lets you reopen earlier results.

The result describes clothing needs, not a verified outfit or catalogue. It records your constraints but cannot verify that a garment satisfies them. The spending ceiling is split evenly across remaining planned needs in whole currency units. Any remainder goes to the first planned roles. When every role is confirmed owned, the allocated total is zero. These allocations are not prices or a promise that an outfit is within budget. Size, fit, stock, delivery costs, taxes, and checkout total are unverified. With a zero spending ceiling, the plan suggests reuse or borrowing without promising availability.

For a positive spending ceiling, planned needs have ordinary Google search links containing generic clothing-role terms, without your private plan details. Opening a link leaves GetYourFit and may let the destination track you. Links are not product offers, endorsements, or affiliate links, and GetYourFit earns nothing from them.

Use **I already have this** only after confirming a suitable item is yours. Confirmation closes that plan gap and reallocates the ceiling across remaining needs. It does not create a garment record. Saved plans remain separate from owned clothes, survive reload, appear in account export, and are removed with account deletion.

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
npm run test:ui
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

`npm run test:ui` checks the main screens of a production build at 390, 768, and 1440px for axe WCAG 2.2 AA violations, the [design rules](DESIGN.md#quality-gate), keyboard focus, and visual regression against screenshots rendered in CI's pinned Linux image (other platforms skip only the pixel comparison). Build first with `npm run build`; Chromium comes from `npx playwright install chromium`.

`npm run verify:wardrobe` builds the production app and drives real signup, photo permission, invalid-image rejection, the licensed photographs in [tests/fixtures](tests/fixtures/README.md), facts and correction, outfit clarification and abstention, cross-account isolation, export, restart, and deletion. Set `GYF_PROOF_DIR` to a directory outside the repository to retain screenshots, snapshots, and network evidence. The verifier selects a free ephemeral loopback port with `GYF_PORT` and owns only its disposable data and named browser session. It never stops another worktree's listener.
