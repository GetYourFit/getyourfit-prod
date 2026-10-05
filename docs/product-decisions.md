# Slice 1 decisions

Date: 2026-10-05

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

React, TypeScript, and Vite serve the browser UI. A same-device Node.js service uses Express and SQLite. Better Auth provides email/password authentication, Argon2id password hashing, email verification, reset tokens, and optional TOTP. Apple Vision performs local garment classification on macOS; no external image or inference service receives the photo. Dependencies have no per-user or API charge.

## Account and privacy decisions

The captain replaced the earlier passkey decision with email/password authentication, verified email, short-lived single-use password-reset links stored as hashes, optional TOTP, secure cookies, origin checks, rate limits, safe logs, sign-out everywhere, export, deletion, a local mail catcher, and an explicit 18+ gate. Optional Google sign-in is deferred unless a free configuration becomes available. The local mail catcher keeps verification and reset messages in process memory and sends nothing externally.

Photo permission covers local processing and storage of the garment photo. It does not grant publication, sharing, or model-training rights. Photo resizing occurs in the browser before the local service receives the image. Temporary image files are removed after classification.

## Limits

This slice does not provide fit or size advice, a style model, commerce, creator content, or remote sync. Apple Vision labels are fallible object classification, not style judgment. Confidence and model provenance are shown; the wearer can correct every fact. Outfit decisions abstain when exact requirements cannot be met.
