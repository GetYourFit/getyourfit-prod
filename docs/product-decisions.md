# Slice 1 decisions

Date: 2026-10-05

## Delivery scope

The foundation PR delivered the buildable app shell. This follow-on increment implements accounts and account-level data controls, following the approved sequence from foundation to accounts and data to wardrobe. The shell-only and pending-status decision applied to the foundation PR and remains true for that PR. Results recorded here are local-runtime evidence, not deployment proof; garment, wardrobe, outfit, and deployment outcomes remain pending.

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

React, TypeScript, and Vite serve the browser UI. A Node.js service bound to loopback uses Express and SQLite. Better Auth provides email/password authentication, Argon2id password hashing, email verification, and optional TOTP. Password reset tokens are random, short-lived, single-use, and stored as hashes. The local account path includes session controls, account export, and account deletion. Real verification and recovery messages use SMTP settings from the server environment. Automated tests can enable an in-memory catcher that only the runner can read; the browser-facing mailbox route is unavailable in SMTP mode. This worktree has no provider configuration, so tests do not prove real-user email delivery. The wardrobe, garment data export/deletion, and Apple Vision path remain unimplemented and are not available claims.

## Account and privacy decisions

The captain replaced the earlier passkey decision with email/password authentication, verified email, short-lived single-use password-reset links stored as hashes, optional TOTP, secure cookies, origin checks, rate limits, safe logs, sign-out everywhere, export, deletion, configurable SMTP delivery, and an explicit 18+ gate. Optional Google sign-in is deferred unless a free configuration becomes available. The isolated verification runner enables an in-memory catcher with a per-run bearer token; browser users receive no mailbox content. The real SMTP provider remains to be configured by the operator.

Photo permission will cover local processing and storage of the garment photo. It will not grant publication, sharing, or model-training rights. Photo resizing is planned in the browser before the local service receives the image. Temporary image files will be removed after classification.

## Limits

This slice will not provide fit or size advice, a style model, commerce, creator content, or remote sync. Apple Vision labels are fallible object classification, not style judgment. Confidence and model provenance will be shown, and the wearer will be able to correct every fact. Outfit decisions will abstain when exact requirements cannot be met.
