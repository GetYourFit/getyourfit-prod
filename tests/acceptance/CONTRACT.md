# GetYourFit v0.1 acceptance contract

This checker uses only public browser and API behavior observed against the local production service, plus the written requirements in `docs/requirements.md`. Endpoint and DTO shapes below are the observed transport projection; the behavioral expectations remain governed by the requirements. The API contract was traced through signup, session, wardrobe listing, photo retrieval, fact correction, removal and outfit requests in a real browser.

## Production process

`npm run build` produces the release build. `npm start` serves that build and its API using `HOST`, `PORT`, `APP_URL`, `GYF_DATA_DIR`, `DATABASE_URL` and `BETTER_AUTH_SECRET`; the production service additionally reads `BETTER_AUTH_URL` and `GYF_MAIL_TRANSPORT=disabled`, which the runner also sets. The runner generates a disposable random 64 character secret for each run and never persists it. Storage for a run must stay inside `GYF_DATA_DIR`. Mail is disabled through `GYF_MAIL_MODE=disabled`; SMTP settings point exclusively to the local sink. No prerequisite external identity or email provider is needed.

## Browser journey

Visible text on the signed-out, signup, and signed-in wardrobe/account pages meets WCAG AA contrast at 390px and 1440px. The contrast case checks the production build with axe-core's `color-contrast` rule, requires at least one evaluated text node per scan, and fails on violations or checks requiring manual review. Normal text requires 4.5:1; large text requires 3:1. It does not establish keyboard, screen-reader, or full WCAG conformance.

A clean landing page has a main region and an accessible Get started, Sign up or Create account action. Name, email and password fields have labels. Empty Name refuses form submission; the checker then supplies a synthetic name. A visible 18+ confirmation checkbox is required, and the browser refuses submission while it is unchecked. Successful signup returns 2xx, sets a private session cookie and closes the signup form before garment controls are checked. Creating an account makes the garment upload available without mail. A labeled Garment photo file control, an initially unchecked photo-processing consent checkbox, and a Save garment/Add garment/Upload photo action let the person add the licensed shirt fixture. An optional Review photo action may precede saving. The wearer confirms the shirt's name, category, color, size, fit, available status, weather, dress codes and ownership before saving. The checker uses the synthetic facts Acceptance beige shirt, top, beige, size M, fits, available, mild weather and smart-casual dress code. The browser then requests an outfit with known weather and dress code; because this journey owns only one shirt, it must receive one question or an abstention and no complete outfit. Refresh preserves the session and the exact saved photo: the rendered image source remains the upload response's `photoUrl`, the image decodes at its natural size, and its rendered pixels match before and after refresh. The journey has no browser errors, external requests or horizontal overflow at 320/390/768/1440 pixels.

All API requests use synthetic accounts and the local app Origin. JSON responses declare `application/json`. Signup creates a usable private session without real mail. Session cookies are HttpOnly and SameSite Lax or Strict. HTTPS deployment must additionally use Secure cookies; this HTTP loopback harness does not prove that deployment property.

| Interface | Request | Observable response |
| --- | --- | --- |
| `POST /api/auth/sign-up/email` | `{name,email,password,adultConfirmed:true,callbackURL}` with generated credentials | 2xx JSON, private session cookie; account usable immediately |
| Rejected signup | Same valid fields with `adultConfirmed:false` or omitted | 4xx, no session cookie; follow-up login cannot use the rejected account |
| `POST /api/auth/sign-in/email` | `{email,password,rememberMe:false}` | 2xx JSON for valid credentials; same 401 status and JSON body for wrong password and unknown email; neither creates a session |
| `GET /api/session` | Session cookie | `{signedIn:true,email,...}` for its account; `{signedIn:false,...}` anonymously |
| Duplicate signup | Existing email, new generated password | Original password still signs in; duplicate input does not replace it |
| `POST /api/wardrobe` | JSON `{facts:{name,category,color,size,fit,owned:true,available,weather,dressCode},consent:true,image}` where `image` is base64 JPEG bytes | 2xx garment record with stable `id`, nested confirmed `facts`, `photoConsent:true`, and `photoUrl` |
| Rejected photo | Missing/false consent or damaged image bytes | 4xx; no new wardrobe record |
| `GET /api/wardrobe` | Session cookie | Array of that person's garment records; no records for a new account |
| `GET /api/wardrobe` | No session cookie | 401/403/404 or an empty array; never another person's records |
| `GET /api/wardrobe/:id/photo` | Owner session | Actual decodable image, at least 100 pixels per side, visually matching the uploaded shirt after resizing or re-encoding |
| `PATCH /api/wardrobe/:id` | Owner session and flat confirmed-facts JSON object | Updated garment record; another user's or anonymous session cannot read, update, delete, list, or retrieve its photo |
| `DELETE /api/wardrobe/:id` | Owner session | Removal; another user's or anonymous session cannot read, update, delete, or retrieve its photo |
| `POST /api/wardrobe/outfit` | `{occasion:"dinner",weather:"mild",dressCode:"smart-casual"}` | `{kind:"complete",items:[...],explanation,...}` when a complete owned set is supported |
| Missing outfit facts | One of `weather:"unknown"` or `dressCode:"unknown"` | A nonempty `context-question` for that fact, or an `incomplete` abstention with a nonempty explanation; no outfit items |

Every complete outfit has top, bottom and footwear categories. Every suggested record is in the wearer's collection, owned, available, confirmed to fit, and has weather and dress-code facts matching the known request. The checker saves a matching complete set plus available distractors that are unfit, unavailable, or incompatible with the request, and rejects any such distractor in the result. A complete result cannot contain suggested or unowned items.

With only one owned shirt, or when weather or dress code is unknown, the API asks one question or abstains without an outfit. The checker requires the public question to identify the missing fact, or requires a nonempty abstention explanation. Its complete-set proof uses three licensed real image fixtures, reusing those fixtures for fact variations; the browser journey separately proves the one-shirt alternative. It checks factual constraints, not fashion quality or ranking.

The checker reads a garment through the owner's wardrobe collection and photo URL; it does not assume a per-item GET route. No exact inference label, internal database structure, component name, scoring implementation or model provider is asserted. A future transport change must be reconciled against public browser/API behavior while retaining the same requirement outcomes and their bad-variant proofs.
