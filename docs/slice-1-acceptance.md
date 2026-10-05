# Slice 1 acceptance matrix

This checklist is the production-equivalent acceptance contract for the narrow first-user path. Run from a fresh browser against isolated local data. Record each result and evidence path in the task evidence ledger. A final page screenshot alone is not proof.

| ID | User action | Passing observation | Result |
| --- | --- | --- | --- |
| A01 | Open the app as a new wearer | Purpose and one primary action are clear; layout works at desktop and 390px mobile width. | Passed in desktop and mobile browser review; screenshots are in the task evidence directory. |
| A02 | Create an account | Valid email, password, and explicit 18+ confirmation create an unverified account; under-18 or weak-password attempts do not. | Passed in `npm run verify:auth` |
| A03 | Verify email, replay link, and sign in | A current local email link verifies once; reuse reports invalid/used; an unverified sign-in gives a safe response and a fresh link. | Passed in `npm run verify:auth` |
| A04 | Request and use password recovery | Known and unknown addresses have the same public response; reset expires, works once, updates password, and revokes sessions. | Passed in `npm run verify:auth` |
| A05 | Probe origin and rate controls | Cross-origin and missing-origin mutations fail; reset and sign-in rate limits trigger; a successful sign-in clears the user's failure count. | Passed in `npm run verify:auth` |
| A06 | Configure TOTP, use an invalid code, then sign in with a valid code | Invalid codes fail; enrollment and a valid code work; setup data is not exposed during sign-in. | Passed in `npm run verify:auth` |
| A07 | Sign out locally and everywhere | Local sign-out ends this session. Revoke-all deletes every account session and clears the configured secure cookie. | Passed in `npm run verify:auth` |
| A08 | Add a real garment photo | Ask permission before local processing; resize in browser; invalid bytes and unsupported types are rejected; no image leaves the device. | Passed with the task-supplied real shirt; classifier and image requests stayed on loopback. Damaged-photo regression also passes. |
| A09 | Review and correct the garment | Show honest classifier source, version, and confidence; wearer correction persists with source `wearer-correction`, model version `null`, and confidence `1`. | Passed in browser. Apple Vision reported its label, version, and confidence; the wearer-selected `Top` persisted with the required provenance. |
| A10 | Reopen the wardrobe | The saved real photo loads from the local service and corrected facts remain visible after refresh. | Passed in browser. The saved photo loaded at 960px natural width and the corrected category remained visible after the wardrobe refreshed. |
| A11 | Request an outfit with unknown required facts | Ask one focused question; do not describe an incomplete set as complete. | Passed. The app asked one question at a time for dress code and weather, then abstained. |
| A12 | Complete the decision | Show a complete explained set only from owned, available, fitting garments that satisfy known weather and dress-code facts. | Pending real-wardrobe browser review |
| A13 | Correct or reject one outfit item | The correction wins on the next decision with the same context and changes the persisted wardrobe decision. | Pending. The available wardrobe could not form a complete outfit. |
| A14 | Remove footwear or make all candidates unavailable or incompatible | Report no complete outfit and show no partial look as a recommendation. | Passed. With one real top in the wardrobe, the app returned no partial recommendation. |
| A15 | Export data | Export includes garment facts, stored photo, inference provenance, and saved corrections. | Passed in the browser and `npm run verify:auth`. The real-garment export included its photo, inference record, and wearer-correction provenance. |
| A16 | Delete account data | Confirmed deletion removes account, credentials, sessions, garment photos, facts, corrections, and returns to signed-out state. | Passed in the browser and `npm run verify:auth`; the disposable account returned to sign-in. |
| A17 | Stop the local service and submit sign-in | Show the designed local-service error without leaking server detail or losing typed fields unnecessarily. | Passed in `npm run verify:auth` |
| A18 | Run regression case R13 from the workflow repository | The known-bad case fails against this app and its corresponding valid flow passes. Do not copy or alter R13 here. | Pending. The workflow repository and case source were not available through the configured GitHub organization or code search. |

## Manual browser proof

Use the local verification guide in [.cursor/skills/verify-getyourfit/SKILL.md](../.cursor/skills/verify-getyourfit/SKILL.md). Keep the database, browser state, and photos isolated. Capture action and resulting state as screenshots or accessible snapshots, inspect network requests, and confirm persisted effects through a second user-facing view or the isolated local database.

## Photo decode regression

Select a five-byte file containing `00 01 02 03 04`, named `damaged.jpg` with MIME type `image/jpeg`. Confirm photo permission and choose **Review photo on this device**. The page must announce `This file could not be opened as an image. Choose a different JPEG, PNG, or WebP photo.`, keep Save disabled, and send no request to `/api/vision/classify`. Then select a valid local JPEG or PNG and confirm that review reaches the on-device classifier. Keep screenshots and network evidence outside the repository.
