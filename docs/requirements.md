# Requirement status

This file tracks every requirement ID in the captain's GYF requirements (R1-R37 and acceptance A-1). `slice1-local` means only the narrow treatment stated here passes local acceptance, not the broader original requirement or deployment. `slice1-pending` means its complete named acceptance remains open. `starter-plan-local` means the task-authorized zero-cash text-plan precursor passes its local acceptance; it does not authorize shopping or satisfy commerce acceptance. `shopping-links-local` means the India retailer section links from one verified affiliate source pass local acceptance; they are not product offers, prices, checkout, or commerce acceptance. `next` and `later` retain contracted work for later vertical slices. `deferred-with-reason` records a capability excluded from the product until evidence and safety gates are met. The production wardrobe proof is bound to head `8662e9ce7d9ed717f7c24989f134af4fae56904b`; historical account checks are identified separately in the acceptance matrix.

## Mission and consumer journey

| ID | Status | Slice 1 treatment |
| --- | --- | --- |
| R1 | slice1-local | One wearer decision for one stated occasion, from their owned wardrobe. |
| R2 | next | Decision traces and repeatable product evaluations remain future work. |
| R3 | later | Creator and retailer sides follow the consumer decision core. |
| R4 | slice1-local | Account, real photo, correction, wardrobe, one outfit, export, and deletion; fit, purchase, social, and long-term memory are deferred. |
| R5 | slice1-local | Occasion, weather, and dress code feed one clear outfit action; unknown required facts produce one question. Natural-language parsing is deferred. Consumer shopping scope is owned by [Build my wardrobe](../README.md#build-my-wardrobe). |
| R6 | next | This slice asks only the questions required to complete its decision. Broader adaptive onboarding needs outcome evidence. |
| R7 | slice1-local | One consented real photo is resized in the browser, classified on the server, reviewed, corrected, and stored with provenance. Additional ownership states and ingestion channels are deferred. |
| R8 | next | Persisted user corrections are the first memory signal; the broader typed style memory and decay model need repeated outcomes. |
| R9 | slice1-local | Owned garment records require photos and confirmed facts. Separate starter-plan states are described in [Build my wardrobe](../README.md#build-my-wardrobe). Imports remain deferred. |
| R10 | slice1-local | Store category, color, size, fit, availability, weather, and dress-code facts with source and inference provenance. Extended material, measurement, and commerce fields are deferred. |

## Intelligence

| ID | Status | Slice 1 treatment |
| --- | --- | --- |
| R11 | slice1-local | Exact code enforces factual constraints. No hand-written taste ranking or fabricated model fallback; abstain when a complete valid set is unavailable. |
| R12 | next | The current slice needs no model router. Add a replaceable intelligence path only with evaluated models. |
| R13 | later | Retrieval and coverage benchmarks require a real catalog and labeled outcomes. |
| R14 | later | Learned outfit-composition comparisons require representative outfit data. |
| R15 | deferred-with-reason | Look adaptation has no licensed reference-look source or evidence in the first wearer task. |
| R16 | deferred-with-reason | Fit and size guidance needs wearer measurements, garment measurements, and evidence not collected in slice 1. |
| R17 | later | Return prevention requires commerce and return outcomes. |
| R18 | deferred-with-reason | Virtual try-on is outside slice 1 and lacks validated identity, garment, and realism gates. |
| R19 | slice1-local | The app shows classifier provenance and confidence, asks one missing-fact question, and abstains when a complete outfit cannot be supported. |

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
| R24 | next | SQLite garment records carry provenance and cascade deletion; a versioned event model waits for real outcomes and access patterns. |
| R25 | next | Slice 1 has no model ranker. Explanations derive from the exact outfit decision state. |
| R26 | slice1-local | Private account data, explicit photo permission, secure sessions, export and deletion; no ethnicity inference, desirability ranking, body data, or data sale. Accounts require an 18+ confirmation. |
| R27 | slice1-local | Bound local image size and types, decode before use, resize client-side, isolate temporary classifier files, enforce local origin and account ownership, and audit without raw personal data. |
| R28 | next | Do not report fashion-decision metrics without wear or keep outcomes. This slice records no fake success metric. |
| R29 | deferred-with-reason | No retailer commerce exists to measure retained margin. |
| R30 | shopping-links-local | Personal data is never sold. Affiliate behavior and disclosures are owned by [Build my wardrobe](../README.md#build-my-wardrobe); source permissions are owned by [shopping sources](shopping-sources.md). Monetization beyond these links follows measured value. |
| R31 | next | No experiment is run before there is enough usage to define a meaningful primary measure and guardrails. |
| R32 | later | A go-to-market wedge follows repeatable wearer outcomes. |
| R33 | next | Product evidence and limits are recorded here; competitor and superiority claims wait for measured research. |
| R34 | later | Model research stays separate from this production slice and is admitted only on evidence. |
| R35 | next | Apply the capability admission gate when a substantial capability is proposed. |
| R36 | slice1-local | Ship one complete wearer outcome and keep every wider requirement visible in this ledger. |
| R37 | slice1-local | One local journey connects the request, wardrobe, decision, explanation, correction, and user control. |

## Acceptance A-1

| Area | Status | Evidence boundary |
| --- | --- | --- |
| Understand value, secure account, minimal onboarding | slice1-local | v0.1 email/password creation and sign-in, 18+ confirmation and local session; email activation follows the [mail release handoff](deploy-inputs.md#mail-release-handoff). |
| Real photo and correctable interpretation | slice1-local | Browser resize, explicit photo consent, server-side Apple Vision classification, persisted wearer correction, and private image load from the account. |
| Wardrobe and outfit judgment | slice1-local | Complete outfit only from owned, available, fitting items matching known weather and dress code; one clarifying question or an abstention otherwise. |
| Zero-garment starter-plan precursor | starter-plan-local | Scope and usage: [Build my wardrobe](../README.md#build-my-wardrobe). Observable API behavior and acceptance coverage: [starter-plan contract](../tests/acceptance/CONTRACT.md#zero-garment-starter-plan-precursor). |
| Zero-garment India shopping links | shopping-links-local | Scope and usage: [Build my wardrobe](../README.md#build-my-wardrobe). Source verification and rights: [shopping sources](shopping-sources.md). Observable API behavior and acceptance coverage: [shopping-links contract](../tests/acceptance/CONTRACT.md#india-shopping-links). |
| Model-driven taste, look adaptation, fit advice, commerce, try-on | deferred-with-reason | No evaluated taste model, licensed look corpus, fit evidence, commerce, or validated try-on model is available for slice 1. |
| Persistent correction, export, deletion | slice1-local | Saved context-specific corrections, archive export, and account cascade deletion. |
| All states, accessibility, responsive behavior, security, and visual review | slice1-pending | Verify against `slice-1-acceptance.md`; do not claim accessibility or performance conformance until the named checks are recorded there. |
| Production deployment, rollback, launch telemetry, early outcomes | deferred-with-reason | Deployment remains gated by the launch approval and credential checks in the dispatch. This worktree stays local and makes no deployment claim. |

## Slice 1 outcome

Proven locally for v0.1: a wearer can sign in, add real garment photos with consent, confirm or correct facts, inspect their small wardrobe, and get one complete explained occasion outfit from owned items. Missing required facts produce one question; hard constraints that prevent completeness produce an abstention. The outcome removes guesswork about whether an owned set satisfies the wearer's stated facts; it makes no taste or fit prediction and provides no checkout. [Build my wardrobe](../README.md#build-my-wardrobe) owns the separate planning and shopping scope for people starting without garments. Every wider requirement remains listed above. Real-provider verification/recovery, deployment and broader conformance remain outside this local proof.
