# Slice 1 acceptance matrix

The 2026-10-12 version ladder targets v0.1: email/password signup without mail, real licensed garment photo upload, and one outfit suggestion in a real browser. The photo/outfit increment now implements the remaining local path, including correction and garment data controls; complete browser acceptance is still pending. Verification and password recovery delivery are sequenced for v0.2. The preserved email verifiers use a restricted test mailbox and controlled SMTP relay, not a real provider. Deployment is separate. Run from a fresh browser against isolated local data and record each result against its actual version and head.

| ID | User action | Passing observation | Result |
| --- | --- | --- | --- |
| A01 | Open the app as a new wearer | Purpose and one primary action are clear; layout works at desktop and 390px mobile width. | Pending |
| A02 | Create an account | Valid email, password, and explicit 18+ confirmation create an unverified account and immediate session without mail; under-18 or weak-password attempts fail. | Passed locally in production browser via `npm run verify:local-account`; v0.1 |
| A03 | Verify email, replay link, and sign in | A current email link verifies once; reuse reports invalid/used; an unverified sign-in gives a safe response and a fresh link. | v0.2; controlled tests only, real-provider delivery pending |
| A04 | Request and use password recovery | Known and unknown addresses have the same public response; reset expires, works once, updates password, and revokes sessions. | v0.2; default v0.1 hides recovery and rejects reset requests |
| A05 | Probe origin and rate controls | Cross-origin and missing-origin mutations fail; reset and sign-in rate limits trigger; a successful sign-in clears the user's failure count. | Passed locally in `npm run verify:auth` |
| A06 | Configure TOTP, use an invalid code, then sign in with a valid code | Invalid codes fail; enrollment and a valid code work; setup data is not exposed during sign-in. | Passed locally in `npm run verify:auth` |
| A07 | Sign out locally and everywhere | Local sign-out ends this session. Revoke-all deletes every account session and clears the configured secure cookie. | Passed locally in `npm run verify:auth` |
| A08 | Add a real garment photo | Ask permission before local processing; resize in browser; invalid bytes and unsupported types are rejected; no image leaves the device. | Pending |
| A09 | Review and correct the garment | Show honest classifier source, version, and confidence; wearer correction persists with source `wearer-correction`, model version `null`, and confidence `1`. | Pending |
| A10 | Reopen the wardrobe | The saved real photo loads from the local service and corrected facts remain visible after refresh. | Pending |
| A11 | Request an outfit with unknown required facts | Ask one focused question; do not describe an incomplete set as complete. | Pending |
| A12 | Complete the decision | Show a complete explained set only from owned, available, fitting garments that satisfy known weather and dress-code facts. | Pending |
| A13 | Correct or reject one outfit item | The correction wins on the next decision with the same context and changes the persisted wardrobe decision. | Pending |
| A14 | Remove footwear or make all candidates unavailable or incompatible | Report no complete outfit and show no partial look as a recommendation. | Pending |
| A15 | Export data | Export includes garment facts, stored photo, inference provenance, and saved corrections. | Pending |
| A16 | Delete account data | Confirmed deletion removes account, credentials, sessions, garment photos, facts, corrections, and returns to signed-out state. | Pending |
| A17 | Stop the local service and submit sign-in | Show the designed local-service error without leaking server detail or losing typed fields unnecessarily. | Passed locally in `npm run verify:auth` |
| A18 | Run regression case R13 from the workflow repository | The known-bad case fails against this app and its corresponding valid flow passes. Do not copy or alter R13 here. | Pending |

## Manual browser proof

Keep the database, browser state, and photos isolated. Capture action and resulting state as screenshots or accessible snapshots, inspect network requests, and confirm persisted effects through a second user-facing view or the isolated local database.

## Photo decode regression

Select `tests/fixtures/damaged.jpg`, the five-byte sequence `00 01 02 03 04`, through **Review photo on this device** after confirming photo permission. The page must announce `This file could not be opened as an image. Choose a different JPEG, PNG, or WebP photo.`, keep Save disabled, and send no request to `/api/wardrobe/review`. Then select a valid licensed photograph and confirm that review reaches the local classifier. Keep screenshots and network evidence outside the repository.

## R13 contract

The authoritative [workflow regression case](https://github.com/rvzaku/workflow/blob/cb7a7bb98e0ac34d1e983b229bd2e372df29a59e/docs/regression-cases.md) requires end-to-end acceptance of images, sign-in and every designed feature. Its named `tests/test_reference_slice.py` test is still planned and absent at that revision. Do not claim that workflow test was run. The product's `verify:wardrobe` adds executable known-bad checks: a broken real-image URL, a disabled outfit action, and a signed-out session must each fail acceptance. The valid journey exercises all new controls; existing account verifiers exercise the retained account controls. The complete combined evidence remains pending until those commands pass against the final code.
