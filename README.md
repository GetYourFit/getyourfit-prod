# GetYourFit

A private, local-first wardrobe companion. Add a real garment photo, correct what the device recognizes, and get one complete explained outfit for a stated occasion from clothes you own. “You already own it” is a useful result.

## Run locally

Requirements: Node.js 22.12 or later. Local garment classification uses Apple Vision and requires macOS with Swift available.

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Create an account with email and password, then use the process-local mailbox at [http://127.0.0.1:4174/__mail](http://127.0.0.1:4174/__mail) to verify it. The local service listens on `127.0.0.1:4174`. Photos and wardrobe data stay in `.gyf-data/`; no sample wardrobe is seeded and no external image or model service is used.

## Verify

Run `npm run verify` while the app is running. The command checks both local services and updates the feature map from `src/verification/features.json`. Run `npm run verify:auth` for the isolated browser account and security flow. See [.cursor/skills/verify-getyourfit/SKILL.md](.cursor/skills/verify-getyourfit/SKILL.md) and its linked feature guides for real-browser steps.

## Product and design decisions

- [Product contract](docs/PRODUCT.md) records product purpose, constraints, and first-slice outcome.
- [DESIGN.md](DESIGN.md) records the interface system.
- [docs/product-decisions.md](docs/product-decisions.md) records what was kept, merged, and removed from earlier GetYourFit repositories.
- [Requirements](docs/requirements.md) tracks R1-R37 and A-1 without dropping deferred work.
- [Acceptance matrix](docs/slice-1-acceptance.md) records the slice's end-to-end gates and evidence status.
- [Evidence ledger](docs/evidence-ledger.md) records research, decisions, and observed results.
- [FEATURE_MAP.md](FEATURE_MAP.md) links to how a wearer reaches and verifies each feature.
