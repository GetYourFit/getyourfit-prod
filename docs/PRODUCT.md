# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the task constraints: React, TypeScript, Vite, and a local Node.js service with SQLite. This keeps the first slice conventional, local-first, and free to run.

## Users

People who want to decide what to wear, what fits and suits them, and what is worth buying.

## Product Purpose

Turn a person's request, wardrobe, body, taste, and context into a small set of complete, explained, correctable outfits, from what they own and what they can buy. "You already own it" is a first-class answer. The first slice helps a wearer choose one complete outfit from owned clothes for a stated occasion.

## Positioning

Wearer-first fashion decisions grounded in the wearer's real wardrobe and context, with corrections taking precedence over system suggestions.

## First slice outcome

Help a first wearer decide what to wear for one stated occasion, with a complete explained outfit assembled from their own available clothes. Make “you already own it” a useful answer. The wearer can correct every suggestion and their correction wins.

The planned local browser flow is account creation with email and password, email verification, one real garment photo with explicit permission, a small wardrobe, one occasion decision, one clarifying question when required facts are unknown, and data export or deletion. Recovery links will be single-use and expire. Optional TOTP will add a second sign-in step. None of this flow is implemented yet; the repository contains only the app shell.

## Capabilities and Constraints

- Store garment photos and wardrobe records on the same device. Resize photos in the browser before the local service stores them.
- Ask for explicit photo consent and allow the wearer to correct garment facts.
- Make one complete outfit decision from available owned items. Enforce only ownership, availability, size, weather, dress code, and budget facts.
- Ask a clarifying question when a required fact is unknown. Never represent an incomplete set as a complete outfit.
- Every inferred fact records its source, model version, and confidence. Use on-device Apple Vision classification for garment photos and show its label, category, model revision, and confidence for correction. This classifier does not make fashion judgments.
- Keep user data private by default. Do not infer ethnicity, rank desirability, sell personal data, or collect body data in this slice. Require explicit 18+ confirmation before account creation.
- Provide data export and deletion.
- Defer creator, retailer, planner, subscription, body-preview, and merchant features.

## What this slice removes

It removes mock garments, random outfit shuffling, passkey-only account access, community and creator surfaces, retailer and merchant surfaces, planning and subscriptions, body preview, unsupported fit claims, builder-written taste rules, and external image or recognition services. The broader product remains a wearer-first decision system; see [requirements](requirements.md) for the status of each wider requirement.

## Evidence on Hand

- Earlier private product repositories: `GetYourFit/GYF_APP` and `GetYourFit/GYF_MVP`, inspected on 2026-10-05. The former contains a React/Vite prototype with wardrobe and outfit surfaces, but uses mock garments, shuffle-based combinations, and broader community/try-on/profile flows. The latter contains a separate ML and merchant recommendation backend. Neither documents image or model licenses.
- Retained: React/Vite as a familiar web prototype base and the wardrobe-to-outfit task. Replaced: mock inventory and random shuffle with user-owned photos, explicit garment facts, and an explainable constraint check. Removed: community, social sharing, try-on, body profiling, merchant/retail, and mock ML surfaces because they are outside the first slice or lack trustworthy evidence.
- No licensed garment image or usable garment recognition model was found. The product starts with the wearer's own photos and does not fabricate sample wardrobe content.

## Product Principles

- The wearer owns the facts and can correct them.
- "You already own it" is a complete outcome.
- Explain uncertainty and ask before relying on missing facts.
- Keep personal data local and under the wearer's control.
- Learn taste from wearer feedback instead of encoding builder preferences.

## Accessibility & Inclusion

Use semantic HTML, keyboard-accessible controls, visible focus, readable contrast, and reduced-motion support. Do not infer ethnicity or rank desirability. This slice does not collect body data or enable sharing, and it does not create accounts for minors.
