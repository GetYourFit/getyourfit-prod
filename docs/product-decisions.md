# Slice 1 decisions

Date: 2026-10-12

## Delivery scope

The 2026-10-12 version ladder targets v0.1: email/password signup without real mail, one real licensed garment photo upload, and one outfit suggestion in a browser. Verification and reset email delivery move to v0.2, retaining their existing implementation as an opt-in path. This PR completes only the account increment; photo and outfit work follow after it lands. Deployment remains a separate task.

The foundation PR delivered the buildable app shell. This follow-on increment implements accounts and account-level data controls, following the approved sequence from foundation to accounts and data to wardrobe. The shell-only and pending-status decision applied to the foundation PR and remains true for that PR. This account-only increment is intermediate and not product-ready; real garment photos, wearer correction, wardrobe management, complete outfit decisions, and deployment remain required first-slice work. Results recorded here are local-runtime evidence, not deployment proof.

## Product sources reviewed

- `GetYourFit/GYF_APP` is a React/Vite prototype with mock garments, shuffled combinations, and community, profile, sharing, and try-on surfaces.
- `GetYourFit/GYF_MVP` is a separate merchant recommendation backend with ML image processing and third-party storage integrations.
- Neither repository documents licenses or provenance for the garment images or ML models.

## Kept, merged, and removed

- Keep the GetYourFit name, the wardrobe-to-outfit decision, and React/Vite as a familiar browser base.
- Merge sign-in, one real garment photo, garment review and correction, a compact owned wardrobe, an occasion-based outfit decision, and data control into one local-first journey.
- Replace shuffle-based outfits with exact checks for ownership, availability, size, weather, dress code, and budget. Builder-authored taste scoring is removed. Corrections are stored and take precedence for matching context.
- Remove mock inventory, random outfit selection, community and sharing, body profiling, virtual try-on, creator, retailer, merchant, planning, and subscription surfaces from slice 1. They add breadth without proving the first wearer outcome.
- Do not reuse earlier images or models because their provenance and licenses are undocumented. Do not seed a fake wardrobe. The wearer supplies real photos and confirms the garment facts.

## Stack

React, TypeScript, and Vite serve the browser UI. A loopback Node.js service uses Express and SQLite. Better Auth provides email/password authentication with Argon2id hashing and optional TOTP. The default account path needs no mail provider and includes session controls, account export, and deletion. The preserved opt-in email path requires verification and uses hashed, short-lived, single-use reset tokens plus TLS-protected SMTP. Its automated tests enable a runner-only in-memory catcher; browser mailbox requests remain unavailable. No provider is configured, so those tests do not prove real-user email delivery. Photo, correction, wardrobe, outfit, and garment-data controls follow this account increment.

## Account and privacy decisions

The default account mode now disables email delivery, immediately signs in a new adult account, and preserves an honest unverified status in exports. It hides password recovery and rejects reset requests instead of claiming mail was sent. Both runtime modes require the same retained authentication key across restarts. Existing SMTP verification/recovery and restricted test-mailbox code remain available for v0.2 validation.

The captain replaced the earlier passkey decision with email/password authentication, verified email, short-lived single-use password-reset links stored as hashes, optional TOTP, secure cookies, origin checks, rate limits, safe logs, sign-out everywhere, export, deletion, configurable SMTP delivery, and an explicit 18+ gate. Optional Google sign-in is deferred unless a free configuration becomes available. The isolated verification runner enables an in-memory catcher with a per-run bearer token; browser users receive no mailbox content. The real SMTP provider remains to be configured by the operator.

Photo permission will cover local processing and storage of the garment photo. It will not grant publication, sharing, or model-training rights. Photo resizing is planned in the browser before the local service receives the image. Temporary image files will be removed after classification.

## Limits

This slice will not provide fit or size advice, a style model, commerce, creator content, or remote sync. Apple Vision labels are fallible object classification, not style judgment. Confidence and model provenance will be shown, and the wearer will be able to correct every fact. Outfit decisions will abstain when exact requirements cannot be met.
