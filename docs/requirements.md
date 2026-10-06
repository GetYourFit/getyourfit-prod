# Requirement status

This file tracks every requirement ID in the captain's GYF requirements (R1-R37 and acceptance A-1). `slice1-pending` means the requirement is in scope for slice 1 at the narrow scope stated here and is not yet implemented. `next` and `later` retain contracted work for later vertical slices. `deferred-with-reason` records a capability excluded from the product until evidence and safety gates are met.

## Mission and consumer journey

| ID | Status | Slice 1 treatment |
| --- | --- | --- |
| R1 | slice1-pending | One wearer decision for one stated occasion, from their owned wardrobe. |
| R2 | next | Decision traces and repeatable product evaluations remain future work. |
| R3 | later | Creator and retailer sides follow the consumer decision core. |
| R4 | slice1-pending | Account, real photo, correction, wardrobe, one outfit, export, and deletion; fit, purchase, social, and long-term memory are deferred. |
| R5 | slice1-pending | Occasion, weather, and dress code feed one clear outfit action; unknown required facts produce one question. Natural-language parsing and shopping context are deferred. |
| R6 | next | This slice asks only the questions required to complete its decision. Broader adaptive onboarding needs outcome evidence. |
| R7 | slice1-pending | One consented real photo is resized, classified locally, reviewed, corrected, and stored with provenance. Additional ownership states and ingestion channels are deferred. |
| R8 | next | Persisted user corrections are the first memory signal; the broader typed style memory and decay model need repeated outcomes. |
| R9 | slice1-pending | Explicit owned garment photos and facts only. Imports and other ownership states come later. |
| R10 | slice1-pending | Store category, color, size, fit, availability, weather, and dress-code facts with source and inference provenance. Extended material, measurement, and commerce fields are deferred. |

## Intelligence

| ID | Status | Slice 1 treatment |
| --- | --- | --- |
| R11 | slice1-pending | Exact code enforces factual constraints. No hand-written taste ranking or fabricated model fallback; abstain when a complete valid set is unavailable. |
| R12 | next | The current slice needs no model router. Add a replaceable intelligence path only with evaluated models. |
| R13 | later | Retrieval and coverage benchmarks require a real catalog and labeled outcomes. |
| R14 | later | Learned outfit-composition comparisons require representative outfit data. |
| R15 | deferred-with-reason | Look adaptation has no licensed reference-look source or evidence in the first wearer task. |
| R16 | deferred-with-reason | Fit and size guidance needs wearer measurements, garment measurements, and evidence not collected in slice 1. |
| R17 | later | Return prevention requires commerce and return outcomes. |
| R18 | deferred-with-reason | Virtual try-on is outside slice 1 and lacks validated identity, garment, and realism gates. |
| R19 | slice1-pending | The app shows classifier provenance and confidence, asks one missing-fact question, and abstains when a complete outfit cannot be supported. |

## Creator, retailer, and platform

| ID | Status | Slice 1 treatment |
| --- | --- | --- |
| R20 | deferred-with-reason | Creator and social surfaces are explicitly excluded from the first consumer journey. |
| R21 | deferred-with-reason | Creator commerce is excluded until a validated consumer outcome and disclosure design exist. |
| R22 | deferred-with-reason | Retailer platform capabilities are excluded until a retailer wedge is validated. |
| R23 | next | Keep the local decision boundary in service functions; a stable external API is not needed in slice 1. |

## Data, safety, and measurement

| ID | Status | Slice 1 treatment |
| --- | --- | --- |
| R24 | next | Planned SQLite records will carry provenance and deletion behavior; a versioned event model waits for real outcomes and access patterns. |
| R25 | next | No model ranker is planned for slice 1. Explanations will derive from the exact outfit decision state. |
| R26 | slice1-pending | Local-only data, explicit photo permission, secure sessions, export and deletion; no ethnicity inference, desirability ranking, body data, or data sale. Accounts require an 18+ confirmation. |
| R27 | slice1-pending | Bound local image size and types, decode before use, resize client-side, isolate temporary classifier files, enforce local origin and account ownership, and audit without raw personal data. |
| R28 | next | Do not report fashion-decision metrics without wear or keep outcomes. This slice records no fake success metric. |
| R29 | deferred-with-reason | No retailer commerce exists to measure retained margin. |
| R30 | later | Monetization follows measured value; personal data is never sold and commission does not control recommendations. |
| R31 | next | No experiment is run before there is enough usage to define a meaningful primary measure and guardrails. |
| R32 | later | A go-to-market wedge follows repeatable wearer outcomes. |
| R33 | next | Product evidence and limits are recorded here; competitor and superiority claims wait for measured research. |
| R34 | later | Model research stays separate from this production slice and is admitted only on evidence. |
| R35 | next | Apply the capability admission gate when a substantial capability is proposed. |
| R36 | slice1-pending | Ship one complete wearer outcome and keep every wider requirement visible in this ledger. |
| R37 | slice1-pending | One local journey connects the request, wardrobe, decision, explanation, correction, and user control. |

## Acceptance A-1

| Area | Status | Evidence boundary |
| --- | --- | --- |
| Understand value, secure account, minimal onboarding | slice1-pending | Email/password creation and sign-in, verification, recovery, 18+ confirmation, and local session. |
| Real photo and correctable interpretation | slice1-pending | Browser resize, explicit photo consent, on-device Apple Vision, persisted wearer correction, and local image load. |
| Wardrobe and outfit judgment | slice1-pending | Complete outfit only from owned, available, fitting items matching known weather and dress code; one clarifying question or an abstention otherwise. |
| Model-driven taste, look adaptation, fit advice, commerce, try-on | deferred-with-reason | No evaluated taste model, licensed look corpus, fit evidence, commerce, or validated try-on model is available for slice 1. |
| Persistent correction, export, deletion | slice1-pending | Saved context-specific corrections, archive export, and account cascade deletion. |
| All states, accessibility, responsive behavior, security, and visual review | slice1-pending | Verify against `slice-1-acceptance.md`; do not claim accessibility or performance conformance until the named checks are recorded there. |
| Production deployment, rollback, launch telemetry, early outcomes | deferred-with-reason | Deployment remains gated by the launch approval and credential checks in the dispatch. This worktree stays local and makes no deployment claim. |

## Slice 1 outcome

Pending. When slice 1 is complete, the first user can sign in, add one real garment photo with consent, correct the result, inspect their small wardrobe, and get one complete explained occasion outfit from owned items. When required facts are missing, the app asks once; when hard constraints make a complete outfit impossible, it says so. Every wider requirement remains listed above instead of being silently dropped.
