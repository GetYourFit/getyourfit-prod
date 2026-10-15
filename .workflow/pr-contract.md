## Intent

Enforce truthful hosted-storage claims and restore the wardrobe verifier after the public first screen and consent copy changed.

## Observable result

The wardrobe verifier enters the current account routes and finds the consent that states photos are reviewed and stored on GetYourFit's server. The independent browser suite rejects false on-device storage claims in public and signed-in screens, including photo consent and saved garment status.

## Check

`npm run verify:wardrobe` drives the production UI through consent, review, private wardrobe, export, and deletion. `npm run acceptance` drives the independent production journeys. The stub verifier requires ten good cases and 51 intentionally broken variants to fail at their intended assertion. Required acceptance and quality remain green.

## Enforcement matrix row

| Requirement | Behavior | Required check | Evidence |
| --- | --- | --- | --- |
| R4 / R7 / R9 / R10 / R11 | Hosted storage is described honestly throughout entry, consent, wardrobe, and saved/photo states | acceptance and quality | report.json, masked screenshots, stub-mutations.json; production wardrobe verifier |

## Known-bad test

Four new variants inject Saved on this device in the signed-in account and saved-garment states, wardrobe stays on this device, and the former on-device consent. Each must fail the corresponding visible-copy assertion and exit 1. All existing 47 variants remain. The original verifier failed against the current public entry; its stale consent was also incompatible with the new UI.

## Deletes or replaces

Replaces obsolete login-wall navigation and consent expectations in the existing verifier. Its textbox lookup accepts associated helper text in accessible names. Extends browser checks beyond the public privacy paragraph. Changes no product UI or API behavior; the legacy internal consent scope remains the server's existing transport field.
