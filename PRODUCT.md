# GetYourFit

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

People deciding what to wear from clothes they own, or planning the pieces they need to start a wardrobe. The public entry demonstrates an illustrative outfit plan; the private app uses garments the wearer adds and confirms. Success means a useful, complete, correctable fashion decision, with continuity when the wearer returns.

## Product truth and constraints

The current implementation and limitations are documented in [the consumer product contract](docs/PRODUCT.md). Route behavior is in `src/App.tsx` and `src/AccountApp.tsx`. Existing email/password authentication, explicit photo consent, private server storage, corrections, selected-plan continuity, export and deletion must survive visual changes. Preserve the security and release contracts in `docs/evidence/` and the deployment runbook. No production data changes are authorized by a redesign.

The public planner is illustrative and constraint based. It does not establish taste prediction, fit prediction, retailer stock or real prices. Recognition suggestions need wearer review. The separately owned intent-engine and recognition repairs supply intelligence improvements; this interface must state current limitations honestly.

## Brand commitments

Keep the name GetYourFit, real licensed garment photographs, wearer-first language and privacy by default. The redesign brief explicitly delegates creative direction and does not reserve a taste decision. No generated garments, invented endorsements or claims of superiority.

## Accessibility and evidence

Mobile-first browser use, keyboard and screen-reader access, WCAG AA, reduced motion, and 390/768/1440 layouts. Licensed assets and source records live in `public/example/` and `public/fonts/`. Existing quality and acceptance suites own automated verification. No growth outcome is established by a visual redesign.
