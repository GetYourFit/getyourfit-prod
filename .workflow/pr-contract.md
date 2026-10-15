## Intent

Ship the zero-cash Build my wardrobe precursor for people starting without recorded garments. Let a wearer plan one occasion without uploading a garment or creating an account at another service. Return a complete explained text needs plan, role-by-role budget allocation, explicit uncertainty about size, delivery and checkout total, ordinary external search links with clear disclosure, and an honest no-cash or unsupported outcome. Keep planned needs separate from owned garments. Only the wearer's confirmation can close a role. Support save, replace and reject while preserving the existing email/password and private-data controls.

## Observable result

From the existing public entry, a wearer can create or sign in to the existing account, reach the new path beside Add garment, submit one occasion and context, see a complete needs plan, save and reload it, replace a need and the plan, reject it, and confirm an existing owned role. The private saved plan survives reload and appears in account export; a second account cannot read or change it, and account deletion removes access. No planning action uploads a garment or creates a garment record. External links contain only generic clothing-role search terms and make no offer, price, stock, size, delivery, fit, or checkout claim. The existing owned outfit path and privacy controls remain available.

## Check

Run `npm run build`, `npm run lint`, `npm test`, `npm run acceptance:stubs --prefix tests/acceptance`, `npm run acceptance`, and `npm run verify:wardrobe`. The independent browser suite covers the public entry, email/password flow, zero-garment planning, mobile and desktop layout, keyboard submission, failure recovery, budget arithmetic, save/reload, replace/reject, ownership separation, export, cross-account access, and deletion. Its good contract must pass and targeted bad variants must fail at their intended assertions. Run the production app in Chrome with `chrome-devtools-axi` and retain screenshots of the main plan and failure state outside the repository.

## Enforcement matrix row

| Requirement | Behavior | Required check | Evidence |
| --- | --- | --- | --- |
| R4 / R9 / R26 / A-1 / S1 | Authenticated zero-garment planning with private saved needs, wearer-confirmed ownership, explicit limits, and no catalogue claims | Production acceptance, starter-plan known-good and known-bad controls, wardrobe verifier, build and lint | Exact-head `report.json`, stub mutation report, mobile/desktop and failure screenshots, account export and deletion assertions |

## Known-bad test

The independent suite must reject an in-stock or delivery claim without an authorized source, a role allocation that does not sum to the spending ceiling, contradictory outfit and owned-role constraints, and a plan role inserted into the owned garment collection. Existing privacy, consent, contrast, account isolation, and complete-owned-outfit variants remain mandatory and unchanged.

## Deletes or replaces

Adds a separate account-owned starter-plan table that cascades with account deletion and is included in the existing account export. Adds the starter-plan entry and workflow without changing email/password behavior, garment upload consent, owned-garment records, or owned-outfit judgment. No retailer integration, external AI service, paid dependency, stock or price claim, affiliate conversion, account at another service, checkout, or deployment is included. The existing owned-clothes path remains usable.
