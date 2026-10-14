## Intent

Resolve AF-001 so visible normal text is readable at WCAG AA contrast within the existing GetYourFit palette.

## Observable result

Signed-out, signup, wardrobe, and account text meets AA contrast at 390px and 1440px in the production build. Muted text and the warm accent retain their existing roles with darker colors.

## Check

`npm run acceptance` runs the mandatory axe-core contrast case and saves measured findings and masked screenshots. `npm run acceptance:stubs --prefix tests/acceptance` proves the good stub and known-bad variants.

## Enforcement matrix row

| Requirement | Behavior | Required check | Evidence |
| --- | --- | --- | --- |
| A-1 / AF-001 | Visible text meets WCAG AA contrast on phone and desktop | `acceptance` | `contrast.json`, screenshots, `report.json`, `stub-mutations.json` |

## Known-bad test

The `contrast` stub variant restores the original normal-text paragraph color `#74736b` on `#f4f1eb`. The verifier requires the contrast case to fail at its intended assertion and exit 1.

## Deletes or replaces

Replaces low-contrast muted, quiet, accent, label, and sign-in copy colors. Replaces deferred contrast coverage with a mandatory production-build check. Adds no product capability beyond the live scope.
