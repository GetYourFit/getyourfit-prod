## Intent

Ship the operator-accepted India section-links slice beside the existing zero-garment starter plan. The [scope decision](../docs/shopping-sources.md#scope-decision) records acceptance of this narrower result: the existing starter capsule supplies the explained looks, while shopping links select no individual garments. [Build my wardrobe](../README.md#build-my-wardrobe) owns user-facing behavior and disclosures; [shopping sources](../docs/shopping-sources.md) owns source verification and permissions. Preserve the existing plan, account, owned-clothes, and private-data controls.

## Observable result

A wearer with no garments can create a starter plan and browse retailer sections under the [documented shopping scope](../README.md#build-my-wardrobe). The [shopping-links acceptance contract](../tests/acceptance/CONTRACT.md#india-shopping-links) owns the observable API and browser assertions. Shopping actions preserve the empty owned collection and existing saved-plan behavior.

## Check

Run `npm run build`, `npm run lint`, `npm test`, `npm run acceptance:stubs --prefix tests/acceptance`, `npm run acceptance`, and `npm run verify:wardrobe`. [Acceptance documentation](../tests/acceptance/README.md) owns automated coverage and known-bad controls. Live browser verification must also cover a zero-garment plan with section links for the chosen department, role and ownership handling, formal and non-INR abstention, an incomplete one-piece outfit, and the budget uncertainty and affiliate disclosures. Retain revision-bound screenshots and evidence in the testing phase's designated location.

## Enforcement matrix row

| Requirement | Behavior | Required check | Evidence |
| --- | --- | --- | --- |
| R4 / R9 / R26 / R30 / A-1 / S1 | Existing zero-garment planning plus the accepted shopping scope linked above | Shopping unit checks, production acceptance, known-good and known-bad controls, wardrobe verifier, build and lint | Exact-head `report.json`, stub mutation report, mobile/desktop screenshots, and live browser evidence for the scenarios above |

## Known-bad test

The [acceptance contract](../tests/acceptance/CONTRACT.md) owns required rejection behavior and known-bad variants, including shopping links with private tracking fields or a mismatched destination. Existing privacy, consent, contrast, account isolation, starter-plan, and complete-owned-outfit checks remain mandatory.

## Deletes or replaces

Adds a bundled verified source record, an authenticated read endpoint, and shopping links beside existing starter-plan results. No new account, deposit, contract, or paid feed is authorized. Product selection, prices, photos, and copied product text remain excluded under the accepted scope decision. No checkout or deployment is included. The existing owned-clothes path remains usable.
