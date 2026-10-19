## Intent

GetYourFit must run on production-grade data infrastructure for users worldwide, not a SQLite file on one Mac. This change adds opt-in storage of garment photos in a private Supabase Storage bucket with per-user access, beside the existing database storage. [Supabase](../docs/supabase.md#photo-storage) owns the rules and the live-check status.

## Observable result

With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` unset nothing changes: photos stay in the database, on SQLite and on Postgres alike. With both set (Postgres only) new photos are uploaded to the private `garment-photos` bucket under `<user id>/`, served only to their owner through the app, and erased with the garment or the account. A Storage outage returns a retryable 503 and never half-saves or half-deletes.

## Check

Run `npm run build`, `npm run lint`, `npm test`, `npm run test:ui`, `npm run acceptance:stubs --prefix tests/acceptance`, `npm run acceptance` and `npm run verify:wardrobe`. `tests/photo-storage.test.mjs` exercises the Storage path against a local stand-in for the API; the same flow was also run against the live Supabase project with a throwaway account, as recorded in the Supabase document.

## Enforcement matrix row

| Requirement | Behavior | Required check | Evidence |
| --- | --- | --- | --- |
| R24 / privacy | A stored photo is reachable only by its owner and removed with the garment or account | `tests/photo-storage.test.mjs`, `tests/account.test.mjs` | Ownership, stray-object, outage and startup-validation assertions |

## Known-bad test

`tests/photo-storage.test.mjs` fails if another account, or nobody, can obtain a stored photo, if a request for another account's photo reaches Storage, if the bucket is public, if account deletion leaves objects behind, or if an outage loses or half-saves a garment.

## Deletes or replaces

Adds a nullable `photo` column and a `photo_object` column in migration 0004 (SQLite gains `photo_object` only). Nothing is removed and no existing photo moves; the import stage uploads them. No Supabase call is made unless both environment values are set.
