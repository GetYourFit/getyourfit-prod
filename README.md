# GetYourFit

GetYourFit aims to be a private, local-first wardrobe companion: add a real garment photo, correct what the device recognizes, and get one complete explained outfit for a stated occasion from clothes you own. “You already own it” is a useful result.

This repository currently contains only the app shell. Sign-in, garment photos, the wardrobe, and outfit decisions land in later changes, each with its own scripts and verification.

## Run locally

Requirements: Node.js 22.12 or later.

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Check

```sh
npm run lint
npm run build
```

## Product and design decisions

- [Product contract](docs/PRODUCT.md) records product purpose, constraints, and first-slice outcome.
- [DESIGN.md](DESIGN.md) records the interface system.
- [docs/product-decisions.md](docs/product-decisions.md) records what was kept, merged, and removed from earlier GetYourFit repositories.
- [Requirements](docs/requirements.md) tracks R1-R37 and A-1 without dropping deferred work.
- [Acceptance matrix](docs/slice-1-acceptance.md) records the slice's end-to-end gates and evidence status.
- [Evidence ledger](docs/evidence-ledger.md) records research, decisions, and observed results.
