# v0.1 black-box boundary

The behavioral requirements are the captain's v0.1 ladder and R4/R5/R7/R14/R19/R26/R27/A-1. This document states the transport projection this checker expects so the product and integration owners can reconcile differences without reading or copying builder tests. It is a checker-owned boundary, not a claim that these routes already exist.

## Production process

`npm run build` produces the release build. `npm start` serves that build and its API using `HOST`, `PORT`, `APP_URL`, `GYF_DATA_DIR`, `DATABASE_URL` and `BETTER_AUTH_SECRET`; the production service additionally reads `BETTER_AUTH_URL` and `GYF_MAIL_TRANSPORT=disabled`, which the runner also sets. The runner generates a disposable random 64 character secret for each run and never persists it. Storage for a run must stay inside `GYF_DATA_DIR`. Mail is disabled through `GYF_MAIL_MODE=disabled`; SMTP settings point exclusively to the local sink. No prerequisite external identity or email provider is needed.

## Browser journey

A clean landing page has a main region and an accessible Get started, Sign up or Create account action. Email and password fields have labels. If present, the 18+ checkbox is explicitly selected by the test user. Creating an account makes the garment upload available without mail. A labeled Garment photo file control, an initially unchecked photo-processing consent checkbox, and a Save garment/Add garment/Upload photo action let the person add the licensed shirt fixture. An optional Review photo action may precede saving. Labeled Occasion, Weather and Dress code inputs and a Suggest an outfit action submit explicit facts; natural-language parsing is a future case, not applicable until the product contract enables it. The response explanation and uploaded image are visible. Refresh preserves the session and garment. The journey has no browser errors, external requests or horizontal overflow at 320/390/768/1440 pixels.

## API projection

All JSON responses declare `application/json`. Mutation requests carry the app Origin. Session cookies are HttpOnly and SameSite Lax or Strict. HTTPS deployment must additionally use Secure cookies; this HTTP loopback harness does not prove that deployment property.

| Interface | Request | Observable response |
| --- | --- | --- |
| `POST /api/auth/register` | `{email,password,age_confirmed:true}` with generated credentials | 2xx JSON, private session cookie; account usable immediately |
| `POST /api/auth/login` | `{email,password}` | 2xx JSON for valid credentials; identical 401/403 status and JSON body for wrong password and unknown email; neither creates a session |
| `GET /api/auth/session` | Session cookie | `{email}` for its account; 401/403 anonymously |
| Duplicate registration | Existing email, new generated password | 400/409/422; original password still signs in |
| `POST /api/wardrobe/items` | Multipart `photo` (real JPEG), `photo_consent=true`, `ownership=owned` | 2xx `{id,photo_url,ownership:"owned"}` with stable ID |
| Rejected photo | Missing/false consent, damaged JPEG or unsupported MIME | 400/415/422; no new wardrobe record |
| `GET /api/wardrobe/items` | Session cookie | `{items:[...]}` containing only that person's records |
| `GET /api/wardrobe/items/:id` | Owner session | Persisted garment record with its retrievable `photo_url` |
| Garment/asset access | Another user's or anonymous session, read/update/delete/photo URL | 401/403/404; original record unchanged |
| Photo URL | Owner session | An actual decodable image, at least 100 pixels per side, visually matching the uploaded shirt after resizing/re-encoding |
| `POST /api/outfits` | `{occasion:"dinner",weather:"mild and dry",dress_code:"smart casual"}` | `{outfits:[{items:[...],explanation:"..."}]}` with a nonempty explained set |

Each outfit includes top, bottom and footwear categories, uses the uploaded shirt ID and does not claim extra suggested items are owned. v0.1 accepts suggestions for missing pieces because its intake has exactly one garment; it does not pretend that one shirt is an entire owned outfit. The test verifies this structural boundary and grounding, not expert fashion quality, model provenance, real availability or a supported price for suggested products. Those need independent future evidence.

No exact inference label, internal database structure, component name, scoring implementation or model provider is asserted. Where the product's published transport contract differs, firstmate can reconcile the projection while retaining the behavioral requirement and its bad-variant proof.
