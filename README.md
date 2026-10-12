# GetYourFit

GetYourFit aims to be a private, local-first wardrobe companion: add a real garment photo, correct what the device recognizes, and get one complete explained outfit for a stated occasion from clothes you own. “You already own it” is a useful result. The foundation PR delivered the buildable app shell; this follow-on account-and-data increment implements local accounts and account data controls. This increment is not product-ready and does not complete the first slice. Real garment photos, wearer correction, the wardrobe, and complete outfit decisions remain required work.

Create an account with email and password, then manage account security and account data from the private account page. The v0.1 default sends no email and allows sign-in with an unverified address. Email verification and password recovery are sequenced for v0.2. Garment photo capture and correction, wardrobe management, and outfit decisions are not available in this account increment.

## Run locally

Requirements: Node.js 22.12 or later.

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
npm run verify
npm run verify:auth
npm run verify:local-account
npm run acceptance
```

## Product and design decisions

- [Product contract](docs/PRODUCT.md) records product purpose, constraints, and first-slice outcome.
- [DESIGN.md](DESIGN.md) records the interface system.
- [docs/product-decisions.md](docs/product-decisions.md) records what was kept, merged, and removed from earlier GetYourFit repositories.
- [Requirements](docs/requirements.md) tracks R1-R37 and A-1 without dropping deferred work.
- [Acceptance matrix](docs/slice-1-acceptance.md) records the slice's end-to-end gates and evidence status.
- [Evidence ledger](docs/evidence-ledger.md) records research, decisions, and observed results.
- [Feature map](FEATURE_MAP.md) links to generated account and data-control browser guides.
