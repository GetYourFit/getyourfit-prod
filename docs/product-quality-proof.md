# Public first screen quality proof

Measured on 2026-10-14 against production builds, before and after this front-door increment. The direction document was committed as `01eea3d` before changing pixels. The baseline was `b94ec0a`; local after evidence records a dirty working tree truthfully. Required CI tests the final pushed revision separately.

## Visible result

Before: an account form appeared before any garment or outfit. On phones, inputs used 13px text, mode actions were approximately 26px tall, and opening signup left focus on the body. Privacy implied device-local storage. After: a complete labeled example and its reasons precede signup; inputs are 16px, standalone mode actions at least 44px, and entry, failure, and success move keyboard focus deliberately. The public screen works while the account API is unavailable.

Three real Met Open Access photographs show a top, trousers, and footwear. Their facts are explicitly illustrative and their historical collection source is disclosed. They are never seeded into a wearer's wardrobe. [Image provenance](../public/example/provenance.json) includes individual records, CC0 source, hashes, dimensions, and responsive transformations. [Font provenance](../public/fonts/provenance.json) records the self-hosted Manrope source and license.

Before/after full-page screenshot pairs for all requested widths are retained in the task evidence collection: `journey-before/public-390.webp`, `public-768.webp`, `public-1440.webp`, and `journey-final/public-390.webp`, `public-768.webp`, `public-1440.webp`. The before captures come from the corresponding Lighthouse full-page image with verified width settings. Final captures come from the final matched audits. These files and raw reports remain outside the repository as required by the task. CI retains final public and masked account screenshots in its acceptance artifact.

## Lighthouse

| Width and viewport | Before performance / accessibility / best practices | After performance / accessibility / best practices | Before / after CLS |
| --- | --- | --- | --- |
| 390 x 844, mobile | 90 / 100 / 96 | 99 / 100 / 100 | 0 / 0 |
| 768 x 1024, desktop | 100 / 100 / 96 | 100 / 100 / 100 | 0 / 0 |
| 1440 x 1000, desktop | 100 / 100 / 96 | 100 / 100 / 100 | 0 / 0 |

Lighthouse 13.4.1, Headless Chrome 155, device scale 1, standard simulated throttling, loopback production service, one audit per width per recorded batch. All requested categories were enabled. Results are single observations, not a statistically established speedup, physical-device study, or deployed-environment conformance claim.

The first redesign measurement scored 87 on mobile, with approximately 475KiB transferred and an uncompressed public module. Actual response headers confirmed the transport issue. Standard Express compression now applies only to public static responses, and image `srcset` serves smaller decoded photographs. The final mobile audit transferred 156,853 bytes and measured LCP 1,957ms, with zero total blocking time. Private API responses are excluded from compression. The intermediate audit remains in the evidence collection.

## Acceptance and finish review

All ten independent production cases passed. All ten good-stub cases passed, and all 47 targeted known-bad variants failed their intended assertion. The original contrast defect remains enforced. Twelve contrast scans cover public, sign-in, signup, and wardrobe/account at 390, 768, and 1440px, with zero violations and unresolved checks. The public screen also passes the full axe WCAG 2 A/AA and 2.1 A/AA rule set at those widths. This is automated evidence, not a claim of complete WCAG conformance.

The browser proves that blocked account APIs do not hide the example, public photographs decode from self-hosted bytes, the example explains its limits, signup loading announces status, entry focuses Name, password requirements are associated with the input, and a failed Enter submission preserves fields and focuses its alert. Retrying with Enter creates a session and focuses an empty wardrobe. A separate touch-enabled phone context proves submission by tap. Existing private upload, photo persistence, ownership isolation, and explained-outfit behavior remain covered.

Build, lint, and all 16 unit tests passed. The design detector returned no findings. Visual review and design documentation were performed inline because this worker is instructed not to delegate. The final composition has one clear value statement, a recognizable complete set, visible example limits, and the primary action directly following its explanation.

Private outfit composition, consistent private controls, editor focus restoration, and direct wardrobe-load retry remain follow-up increments. Classifier cold-start measurement remains a separate performance increment. No user research, customer feedback, deployment, or live-host changes are claimed here.
