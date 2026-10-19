<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Export or delete your data

Download the account, garment photos, confirmed facts, classification provenance and saved outfit corrections, or erase them with the account.

## Sub-features

- account-export downloads profile fields, garment facts and per-fact provenance, stored JPEG photos as base64, original classification provenance, consent timestamps, and context-specific outfit corrections without credentials or session secrets.
- account-delete cascades across credentials, sessions, wardrobe photos, facts and outfit corrections in one Postgres statement; Postgres autovacuum later reclaims the retired rows.

## How to get to it (user POV)

- Sign in to open the account page.
- Choose Download export to save the account JSON.
- Choose Delete my data and confirm to remove the account.

## Driving it with chrome-devtools-axi

Preconditions:

- Sign in and add real garments through the wardrobe guide.

- **Export.** Open Account and choose Download export. Inspect the JSON: getyourfit-account-export-v1 includes the account, wardrobe photos in JPEG/base64, facts, consent and provenance, and outfitCorrections. Password hashes and session secrets must be absent.
- **Delete.** Choose Delete my data, then Erase permanently. The public page returns; old photo requests fail and the account cannot sign in again.
- **Proof.** npm run verify:wardrobe checks photo metadata removal, wardrobe export and correction records, cross-account access, restart continuity, and database cascade deletion. Existing account verifiers cover credentials, sessions, tokens and exact-recipient test mail cleanup.

## Gotchas

- Exports contain private garment photos. Keep the downloaded copy under your control; deleting app data cannot delete copies you downloaded.
- Classification and wearer provenance remain distinct; wearer confidence 1 records explicit confirmation rather than a statistical model score.
