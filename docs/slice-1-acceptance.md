# Slice 1 acceptance matrix

The 2026-10-12 version ladder targets v0.1: email/password signup without mail, real licensed garment photo upload, and one outfit suggestion in a real browser. The photo/outfit journey passes locally in production Chrome at head `8662e9ce7d9ed717f7c24989f134af4fae56904b`, including correction and garment data controls. Current email activation requirements are in the [mail release handoff](deploy-inputs.md#mail-release-handoff). The preserved email verifiers use a restricted test mailbox and controlled SMTP relay, not a real provider. Deployment is separate. Results below distinguish this wardrobe run from historical account checks; they do not certify all browsers or accessibility conformance.

| ID | User action | Passing observation | Result |
| --- | --- | --- | --- |
| A01 | Open the app as a new wearer | Purpose and one primary action are clear; layout works at desktop and 390px mobile width. | Passed locally; sign-in and outfit screenshots visually reviewed at both widths |
| A02 | Create an account | Signup follows [Mail settings](../README.md#mail-settings); explicit 18+ confirmation and a valid password are required. | Historical no-mail production-browser proof via `npm run verify:local-account` covers only the explicit disabled mode |
| A03 | Verify email, replay link, and sign in | A current email link verifies once; reuse reports invalid/used; an unverified sign-in gives a safe response and a fresh link. | Controlled tests only, real-provider delivery pending |
| A04 | Request and use password recovery | Known and unknown addresses have the same public response; reset expires, works once, updates password, and revokes sessions. | Availability follows [Mail settings](../README.md#mail-settings); real-provider delivery remains unverified |
| A05 | Probe origin and rate controls | Cross-origin and missing-origin mutations fail; reset and sign-in rate limits trigger; a successful sign-in clears the user's failure count. | Passed locally in `npm run verify:auth` |
| A06 | Configure TOTP, use an invalid code, then sign in with a valid code | Invalid codes fail; enrollment and a valid code work; setup data is not exposed during sign-in. | Passed locally in `npm run verify:auth` |
| A07 | Sign out locally and everywhere | Local sign-out ends this session. Revoke-all deletes every account session and clears the configured secure cookie. | Passed locally in `npm run verify:auth` |
| A08 | Add a real garment photo | Ask permission before the photo is reviewed and stored in the wearer's private account on the GetYourFit server; resize in browser; invalid bytes and unsupported types are rejected; the resized photo is uploaded to the server for review. | Passed locally in `verify:wardrobe`; consent, real CC0 photos, invalid browser decode and authenticated API rejection. Correction 2026-10-14: the v0.1 wording said local processing and that no image leaves the device; the hosted product uploads the resized photo to the server, so that claim was false for production |
| A09 | Review and correct the garment | Show honest classifier source, version, and confidence; wearer correction persists with source `wearer-correction`, model version `null`, and confidence `1`. | Passed locally; advisory Vision classification and confirmed facts remain separate; fit and availability corrections persisted |
| A10 | Reopen the wardrobe | The saved real photo loads from the local service and corrected facts remain visible after refresh. | Passed locally; refresh and same-database restart preserve private images and facts |
| A11 | Request an outfit with unknown required facts | Ask one focused question; do not describe an incomplete set as complete. | Passed locally; unknown context and unknown fit each ask one question |
| A12 | Complete the decision | Show a complete explained set only from owned, available, fitting garments that satisfy known weather and dress-code facts. | Passed locally; three-item real-photo outfit in browser; `npm test` also checks two-item completeness and each factual constraint |
| A13 | Correct or reject one outfit item | The correction wins on the next decision with the same context and changes the persisted wardrobe decision. | Passed locally; rejection survives refresh and equivalent occasion casing; Undo restores eligibility |
| A14 | Remove footwear or make all candidates unavailable or incompatible | Report no complete outfit and show no partial look as a recommendation. | Passed locally; missing footwear and unavailable item abstain; Remove/Keep and confirmed garment deletion exercised |
| A15 | Export data | Export includes garment facts, stored photo, inference provenance, and saved corrections. | Passed locally; exported photo hashes match stored bytes, metadata is stripped, and consent/provenance/corrections are retained |
| A16 | Delete account data | Confirmed deletion removes account, credentials, sessions, garment photos, facts, corrections, and returns to signed-out state. | Passed locally; garment/correction tables empty, former photo inaccessible to both accounts, signed-out UI restored |
| A17 | Stop the local service and submit sign-in | Show the designed local-service error without leaking server detail or losing typed fields unnecessarily. | Passed locally in `npm run verify:auth` |
| A18 | Exercise the workflow R13 contract against this app | The known-bad case fails against this app and its corresponding valid flow passes. Do not copy or alter R13 here. | Passed locally for the contract's image, action and sign-in negative cases; the workflow's planned test remains unavailable |

## Manual browser proof

Keep the database, browser state, and photos isolated. Capture action and resulting state as screenshots or accessible snapshots, inspect network requests, and confirm persisted effects through a second user-facing view or the isolated local database.

## Photo decode regression

Select `tests/fixtures/damaged.jpg`, the five-byte sequence `00 01 02 03 04`, through **Review your photo** after confirming photo permission. The page must announce `This file could not be opened as an image. Choose a different JPEG, PNG, or WebP photo.`, keep Save disabled, and send no request to `/api/wardrobe/review`. Then select a valid licensed photograph and confirm that review reaches the server classifier. Keep screenshots and network evidence outside the repository.

## R13 contract

The authoritative [workflow regression case](https://github.com/rvzaku/workflow/blob/cb7a7bb98e0ac34d1e983b229bd2e372df29a59e/docs/regression-cases.md) requires end-to-end acceptance of images, sign-in and every designed feature. Its named `tests/test_reference_slice.py` test is still planned and absent at that revision. Do not claim that workflow test was run. The product's `verify:wardrobe` passes executable known-bad checks: a broken real-image URL, a disabled outfit action, and a signed-out session each fail acceptance, while the restored valid journey passes. The valid journey exercises all new controls; historical account verifiers exercise the retained account controls. This wardrobe proof does not rerun the full TOTP or SMTP suite at the named head.

The local wardrobe verification produced a HEAD-bound report, inspected screenshots, accessible snapshots and a local network capture. Licensed fixture attribution is in [tests/fixtures/README.md](../tests/fixtures/README.md). No fixture wardrobe is seeded into the app.
