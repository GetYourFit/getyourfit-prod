## Intent

Show what GetYourFit does before requiring an account, with honest privacy and a usable phone signup journey.

## Observable result

The public first screen displays a labeled complete example with licensed real garment photographs and reasons. Build my wardrobe opens signup. Tap and Enter create a usable account with an empty private wardrobe. Loading and failures are announced; focus follows entry, error, and success. Hosted storage is described accurately.

## Check

`npm run acceptance` builds and drives the production service. The independent verifier requires ten good cases and detects 47 deliberately broken variants. Quality runs build, lint, and unit tests. See `docs/product-quality-proof.md` for matched Lighthouse audits and screenshots at 390, 768, and 1440px.

## Enforcement matrix row

| Requirement | Observable behavior | Required check | Evidence |
| --- | --- | --- | --- |
| A-1 / R4 / R5 / R7 / R9 / R10 / R11 / R19 / R26 / R27 | Public explained example, truthful storage, touch and keyboard signup, empty private wardrobe, rendered AA contrast | acceptance and quality | report.json, contrast.json, public screenshots, stub-mutations.json |

## Known-bad test

Existing 32 variants remain. Fifteen additions remove the public example, photo, reasons, illustrative-facts disclosure, honest privacy, action touch area, or public compression; break loading announcement, entry focus, password description, phone input size, Enter, alert focus, wardrobe focus, or tap submission. Each must fail its intended assertion and exit 1. The original low-contrast paragraph must still fail AA.

## Deletes or replaces

Replaces the login wall with a public value moment; lazy-loads the account application behind it. Replaces release jargon and false device-storage claims. Replaces account-entry typography and focus behavior. Compresses public static responses and serves responsive real photographs. Private outfit composition, shared controls, recovery, and classifier performance remain sequenced increments.
