# GetYourFit experience direction

2026-10-23. Replacement of the public and private visual system, building on revision `96451e8`. This describes the implementation, not a deployment or a claim that the full Fashion Decision Intelligence contract is complete. [Product truth](../PRODUCT.md), [capability sequencing](requirements.md), and [design tokens](../DESIGN.md) retain separate ownership.

## Wearer and mechanism

Assumed scene: a person on a phone near their clothes, deciding what to wear or which pieces to plan for. This is a task-grounded assumption, not a research interview. The immediate two jobs are **Use my own clothes** and **Build my wardrobe**. The public demonstration uses licensed stand-in photographs; private wardrobes begin empty. The current factual checker uses confirmed facts. Model-driven taste, natural-language interpretation, and fit prediction are not implied by the interface.

## Direction contract

- **Thesis:** Make complete outfits easier to see and useful decisions easier to keep.
- **Own world:** An independent fashion contact sheet. Warm paper, plum shell, rust actions, a pale citron selection accent, precise Manrope typography, fully visible real garments. This is a replacement of the previous cool green system.
- **Story:** See a complete static labelled example, choose an owned-clothes journey or a needs plan, then sign in before product use. Account entry retains only an allowlisted internal destination.
- **First viewport:** Public: job-led value and two explicit paths beside a real complete outfit. Private: familiar navigation, one page title, the saved plan first when present, then clothes, a factual outfit checker, and planning. No fabricated personal content, dashboard scores, or trend claims.
- **Form:** Candidate 3, seed `seed:42968a7142ccaea8`. The signature interaction is the complete-look comparison strip. Look comparison is available after account entry. The landing example is a static marketing illustration. Brief-delegated selection; no taste questionnaire or comp approval gate. Built directly in code.
- **Reach:** Plum shell on private navigation; warm paper on work areas; rust primary controls; larger image wells and clear text rhythm; the same fields, notices, dialogs and tokens across every route.
- **Risk:** Warm editorial styling can become decoration. Standard controls and actual garment facts keep the working app legible. A large initial photograph is still a stand-in, not evidence of taste intelligence.

Seven grounded candidates considered, in order: wardrobe lookbook, dressing-room mirror, fashion contact sheet, clothing care label, fabric swatch library, weekend packing list, independent boutique window. These span publication, physical ritual, labeling and display systems. A generic dashboard and a cinematic luxury-brand homepage were rejected as category defaults that obscure the task.

Catalog challengers were judged through the Operate rule: only type, palette, density and one signature move transfer; familiar navigation and controls stay. Split-flap concourse: declined for poor audience identification; kept its disciplined stable positions while look imagery changes. Factory record catalog: declined because codes hide garment meaning; kept its commitment to one shell color. Garden guide map: declined because organic divisions compete with garment silhouettes; kept explicit selection states. Cassette inlay: competitive on audience familiarity, loses product clarity when a flip hides the other pieces; keep every complete look visible together. Dance notation: declined because symbolic reading adds work; retain an explicit list of the actual pieces. These are design judgments, not comparative user results.

## Bounded primary-source research

Reviewed 2026-10-23. No competitor assets or copy are shipped. This two-product review does not establish novelty or superiority.

| Source | Concrete mechanism | GetYourFit decision |
| --- | --- | --- |
| [Indyx: how it works](https://www.myindyx.com/how-it-works/) | Outfit boards make the relationship between owned garments visible; collections support reuse. | Reuse complete garment compositions and make the owned-clothes job explicit. Do not borrow social sharing, styling subscriptions, calendar or cost-per-wear claims without their underlying behavior. |
| [Whering: outfit suggestions](https://whering.co.uk/faq/can-whering-make-outfits-for-me) | A person can inspect combinations or start from a particular item. | Provide a bounded, deliberate four-look comparison, with an accessible selected state. Do not present random shuffling or the current constraint checker as personalized fashion judgment. |

## Routes and states

| Surface | Existing reachable behavior retained | Design treatment and recovery |
| --- | --- | --- |
| `/` | Public example without account APIs, sign-in, account entry | Explicit two-job choice; static real example; visible illustrative limits, reasons and photo credits. The [planning guide](../README.md#plan-after-signing-in) owns product entry behavior. |
| `/plan` | Occasion, weather, outfit type, budget, currency, dress code; examples; image download; save entry | Signed-in session required. Useful sample before submission, selected result, input validation, failed image-download notice and save disclosure. Browser values stay until navigation; saving uses the existing pending plan. |
| `/sign-up`, `/sign-in`, account callback/query paths | Email/password, age gate, authenticator challenge, recovery-unavailable explanation, connection retry | Focused fields, retained input on rejection, focused errors, visible busy state, accurate hosted-storage copy. Generic pending-save context without exposing private plan details. No new recovery or identity promises. |
| `/wardrobe` | Loading/retry, empty wardrobe, actual garments, edit/remove confirmation | Role counts describe items added, never outfit eligibility. Search name/colour and category filter, result count, no-match recovery. Existing ownership, fit and availability remain visible. |
| Garment dialog | Permission before file selection, image decoding/size errors, recognition loading/progress/manual path, confirmed facts, correction/save failures | Full-screen phone dialog, focus restoration, readable fields and semantic checkboxes. Recognition failure stays distinct from manual confirmation. No loader or inference changes in this lane. |
| `/wardrobe#outfit` | Missing-context and missing-fit questions, complete/incomplete result, exclusions and undo, API errors | One clear factual-check form, complete photo set, explanation, explicit correction controls. Inputs and previous facts survive failures. No claim that the exact checker learns taste. |
| `/wardrobe#build-plan` | Pending save/retry, saved look first, choose look, needs editing, owned confirmation, replace/reject/history, shopping links | Main saved board and chosen look remain prominent; secondary needs and shopping disclosures stay in the existing disclosure. Shopping destinations remain general links with unknown prices, stock and fit. |
| `/account` | Privacy, export, sessions/signout, password, TOTP setup, delete confirmation, failures | Quiet settings rows, destructive actions distinguished with text and color, export/delete contracts unchanged. No added telemetry or consent claim. |
| Lazy/session loading and outages | Text status, auth retry, wardrobe retry, saved-plan retry, API request bounds | Shared typography and colors, retained focused errors and retries. No change to auth budgets, CSP, security headers, tenant isolation or release identity. |

The proposed intent-engine integration remains a future contract: `IntentOutfit.tsx` mounts above the existing factual checker within `Outfit.tsx`, with model-download consent, reviewed constraints, questions/abstention and fresh account-fact validation. Shared styles are available to it. This redesign does not implement or advertise that unlanded behavior.

## Verification and limits

The builder's local browser evidence and independent delivery instructions live in the task evidence directory under `gyf-experience-redesign/`. No source test result is relabeled as live-product proof. The no-mistakes pipeline owns independent review, tests, updated Linux goldens, publication and CI. Provide it this contract and the rendered before/after artifact. Inspect all 390/768/1440 screenshots, including dialogs as viewport captures. Existing known-bad accessibility and acceptance cases must still fail.

Budget: no new font or remote image dependency, same licensed responsive image set, public compressed entry under 130 KiB, CSS under 12 KiB compressed, and no speculative prefetch of model files on public entry. Model payload and inference correctness belong to the recognition and intent owners. Budget checks are upper limits, not measured speedup claims. Reduced motion removes the look-change reveal; all content is visible without waiting for animation.

The current [requirements registry](requirements.md) retains R1-R37. This release improves entry, visual coherence, comparison, finding garments and continuity; it does not close natural intent, learned judgment, style memory, look adaptation, validated fit/VTO, creator/retailer platforms, real-user outcomes or production rollout.

## Business assumptions and measurement

Owner: GetYourFit product. Baseline: no redesign cohort or conversion result has been measured. The [planning guide](../README.md#plan-after-signing-in) owns the anonymous funnel counter definitions and reporting command. These counters do not measure account creation, unique people or causal growth. Existing private corrections and plans are actual stored outcomes; they are not confirmed wear.

Hypothesis: explicit job choice plus visible complete looks improves the proportion of submitted plans that reach a saved plan. Next experiment: compare the same seven-day counter windows before and after a merged rollout, report raw counts and uncertainty, and keep no growth conclusion when traffic is too small or noncomparable. A provisional decision threshold is a five percentage point increase in saved/submitted counts with no new journey failures; this is a product threshold, not a statistical significance claim. Retention, willingness to pay, distribution and unit economics have no valid baseline in this UI task. Observe real returning use through existing lawful records before designing another feature. No campaigns, accounts, spending or telemetry integrations were added.
