# Outfit guides

The public guide index is `/guides/`. Two articles answer a bounded wearer question: how can I choose complete outfits for an ordinary week using clothes I already own? One covers a warm smart-casual office day; the other covers a small capsule rotation. India-first examples state their scope and let the reader adapt to another climate, culture or workplace.

The articles provide the checklist before asking for an account. Guide pages are public static documents; functional product use requires an account. The office article's call to action goes to `/sign-up?next=%2Fplan` (sign-in: `/sign-in?next=%2Fplan`) and the capsule article's to `/sign-up?next=%2Fwardrobe`. Both `next` values are fixed members of the shared return-path allowlist defined by the auth-first change (`shared/auth-return.ts`, `accountEntry`), not user input; until that change lands the parameter is ignored and the wearer arrives at their wardrobe. Guides never put personal answers in a URL and do not change the pending-plan payload.

The landing page does not yet link to `/guides/`. That belongs to the redesign owner's public shell; until then the guides are reached from the sitemap and each other.

## Evidence and limits

Research checked 23 October 2026. This bounded review uses official product descriptions, not comparative product testing or customer interviews:

| Source | Observation | Decision |
| --- | --- | --- |
| [Whering outfit suggestions](https://whering.co.uk/faq/outfit-suggestions-on-Whering) | Describes wardrobe-based suggestions, style/weather context and a shuffle tool. These are vendor claims. | Outfit planning is established. Do not claim that GYF invented it or provides better styling. |
| [Indyx FAQ](https://www.myindyx.com/contact-us) | Describes wardrobe uploads, outfit creation and tracking; says a desktop version is not yet available. These are vendor claims. | A browser entry without an account is not offered by guides; account entry is the honest path. |
| [WHO Heat and health](https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health) | Advises light, loose-fitting clothes in heat. | Cite the narrow comfort guidance. Do not promise cooling from a named fabric or treat clothing advice as heat protection. |
| [NDMA Heat Wave](https://ndma.gov.in/Natural-Hazards/Heat-Wave) | Provides Indian public heat-risk context. | State India-first scope without treating every Indian city or season as hot. |

The goal audit dated 20 October identified generic planner output and a broken selected-look handoff at its audited version. Current code has selected-look preservation and describes the boards as general suggestions. These guides match those implemented capabilities: a factual wardrobe checker and an illustrative planner. They promise no learned taste, live inventory, automatic wear tracking, body rules or verified fit. Actual wearer usefulness and demand remain untested.

The positioning hypothesis is that an answer-first guide lowers the effort of starting one real outfit decision. It is falsified if readers cannot tell the example board from their own wardrobe, cannot complete the save path, or find the checklist unhelpful for their actual day. A bounded next study is five consenting adults, each using their own occasion, reporting whether they can name a usable next outfit or a concrete missing fact. Firstmate owns recruitment and channel authorization; this change performs no outreach. Keep or revise after that study rather than adding more keyword variants.

## Measurement

Owner: `gyf-seo-content` for guide usefulness and entry; `gyf-outcome-measurement` for consent and account outcomes. Baseline: guide visits, search impressions, attributable activation and revenue are **not measured**. Local test visits are synthetic and excluded from business claims. No traffic, ranking, revenue or product-market-fit result is claimed.

There is no guide analytics call, tracking pixel, browser identifier, personal-query collection or third-party SDK. Guide documents have no JavaScript. Existing planner counters begin only after the planner is opened, respect DNT/GPC and store daily event counts without identifiers. Run `npm run funnel` with the existing authorized database configuration to read those counts. They are not unique people, guide referrals or conversion rates, and cannot join guide reading to saving. Counter increases alone cannot validate acquisition.

The published outcome contract v1 belongs to the outcome producer. After its implementation lands, `readOutcomeCohort({ from, to, asOf })` from `server/outcome-report.mjs` supplies consented, mature, explicitly classified real-account signup, first-selection and return counts subject to suppression. It does not attribute a selection to a guide, prove a wear outcome or measure revenue. No extension to its schema is made here. Before any acquisition-rate claim, Firstmate must establish an authorized denominator and channel evidence. Until then the executable checks below prove the journey, not real demand.

## Build and verification

`shared/guides.ts` owns routes and metadata; `src/GuidePage.tsx` owns the public content; `src/styles/guides.css` adds only guide-scoped layout using the existing tokens. The redesign contract's shared Brand, public shell, buttons and type roles remain authoritative. No new visual system, global token or private navigation tab is added.

`npm run build` pre-renders these React components with `scripts/write-guides.mjs`. Production guide HTML contains the complete article, title, description, canonical URL and Open Graph fields, with local CSS and fonts and no application script. The build also writes an app-subdomain sitemap and robots file. Unknown guide routes return HTTP 404 with noindex; robots exclusions do not protect account data. Existing authentication and photo boundaries remain in force.

Run `node --test tests/guides.test.mjs` after building to check production responses and metadata. Run `npm run test:ui -- tests/ui/guides.spec.mjs` for no-JavaScript reading, local links, accessibility, reflow and guide-to-account-entry and saved-plan behavior. Synthetic accounts and isolated databases are removed by the existing test server. Screenshots and manual Chrome proof belong outside the worktree in the task evidence directory.

The capsule photographs reuse the licensed real images in `public/example/provenance.json`, with visible credits and their existing transformations disclosed. They illustrate complete roles, not purchasable products or the wearer's own clothes. No new assets or asset licences are introduced.
