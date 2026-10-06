# GetYourFit

GetYourFit aims to be a private, local-first wardrobe companion: add a real garment photo, correct what the device recognizes, and get one complete explained outfit for a stated occasion from clothes you own. “You already own it” is a useful result. The foundation PR delivered the buildable app shell; this follow-on account-and-data increment implements local accounts and account data controls. This increment is not product-ready and does not complete the first slice. Real garment photos, wearer correction, the wardrobe, and complete outfit decisions remain required work.

Create an account with email and password, then manage account security and account data from the private account page. Configure outbound SMTP before starting the app so people can receive verification and reset links. Garment photo capture and correction, wardrobe management, and outfit decisions are not available in this increment.

## Run locally

Requirements: Node.js 22.12 or later.

Set `SMTP_HOST` and `SMTP_FROM` in the server environment before starting the app. `SMTP_PORT` defaults to `587`; `SMTP_SECURE` defaults to true on port `465` and false otherwise. Non-implicit TLS connections require STARTTLS. Set both `SMTP_USER` and `SMTP_PASS` when the server requires authentication. The project has no provider credentials. Keep them in your local environment, not in source files.

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Run `npm run verify:auth` to drive the account journey in isolated browser sessions and check SMTP delivery behavior. The browser verifier uses a private in-memory catcher, and the delivery check uses a controlled local SMTP server. Neither sends real email or proves delivery through a configured provider. The browser-facing mailbox route remains unavailable in SMTP mode.

## Check

```sh
npm run lint
npm run build
npm run verify
npm run verify:auth
```

## Product and design decisions

- [Product contract](docs/PRODUCT.md) records product purpose, constraints, and first-slice outcome.
- [DESIGN.md](DESIGN.md) records the interface system.
- [docs/product-decisions.md](docs/product-decisions.md) records what was kept, merged, and removed from earlier GetYourFit repositories.
- [Requirements](docs/requirements.md) tracks R1-R37 and A-1 without dropping deferred work.
- [Acceptance matrix](docs/slice-1-acceptance.md) records the slice's end-to-end gates and evidence status.
- [Evidence ledger](docs/evidence-ledger.md) records research, decisions, and observed results.
- [Feature map](FEATURE_MAP.md) links to generated account and data-control browser guides.
