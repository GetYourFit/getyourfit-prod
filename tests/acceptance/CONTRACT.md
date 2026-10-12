# v0.1 black-box boundary

The behavioral requirements are the captain's v0.1 ladder and R4/R5/R7/R9/R10/R11/R19/R26/R27/A-1. This document states the transport projection this checker expects so the product and integration owners can reconcile differences without reading or copying builder tests. It is a checker-owned boundary, not a claim that these routes already exist.

## Production process

`npm run build` produces the release build. `npm start` serves that build and its API using `HOST`, `PORT`, `APP_URL`, `GYF_DATA_DIR`, `DATABASE_URL` and `BETTER_AUTH_SECRET`; the production service additionally reads `BETTER_AUTH_URL` and `GYF_MAIL_TRANSPORT=disabled`, which the runner also sets. The runner generates a disposable random 64 character secret for each run and never persists it. Storage for a run must stay inside `GYF_DATA_DIR`. Mail is disabled through `GYF_MAIL_MODE=disabled`; SMTP settings point exclusively to the local sink. No prerequisite external identity or email provider is needed.

## Browser journey

A clean landing page has a main region and an accessible Get started, Sign up or Create account action. Name, email and password fields have labels. Empty Name refuses form submission; the checker then supplies a synthetic name. If present, the 18+ checkbox is explicitly selected by the test user. Successful signup returns 2xx, sets a private session cookie and closes the signup form before garment controls are checked. Creating an account makes the garment upload available without mail. A labeled Garment photo file control, an initially unchecked photo-processing consent checkbox, and a Save garment/Add garment/Upload photo action let the person add the licensed shirt fixture. An optional Review photo action may precede saving. The wearer confirms the shirt's name, category, color, size, fit, available status, weather, dress codes and ownership before saving. The checker uses the synthetic facts Acceptance beige shirt, top, beige, size M, fits, available, mild weather and smart-casual dress code. The browser then requests an outfit with known weather and dress code; because this journey owns only one shirt, it must receive one question or an abstention and no complete outfit. Refresh preserves the session and garment. The journey has no browser errors, external requests or horizontal overflow at 320/390/768/1440 pixels.

## API projection

All JSON responses declare `application/json`. Mutation requests carry the app Origin. Session cookies are HttpOnly and SameSite Lax or Strict. HTTPS deployment must additionally use Secure cookies; this HTTP loopback harness does not prove that deployment property.

| Interface | Request | Observable response |
| --- | --- | --- |
| `POST /api/auth/register` | `{email,password,age_confirmed:true}` with generated credentials | 2xx JSON, private session cookie; account usable immediately |
| `POST /api/auth/login` | `{email,password}` | 2xx JSON for valid credentials; identical 401/403 status and JSON body for wrong password and unknown email; neither creates a session |
| `GET /api/auth/session` | Session cookie | `{email}` for its account; 401/403 anonymously |
| Duplicate registration | Existing email, new generated password | 400/409/422; original password still signs in |
| `POST /api/wardrobe/items` | Multipart real JPEG, `photo_consent=true`, and wearer-confirmed `name`, `category`, `color`, `size`, `fit`, `available`, `weather`, `dress_code`, `ownership=owned` | 2xx `{id,photo_url,ownership,name,category,color,size,fit,available,weather,dress_codes}` with each confirmed fact persisted |
| Rejected photo | Missing/false consent, damaged JPEG or unsupported MIME | 400/415/422; no new wardrobe record |
| `GET /api/wardrobe/items` | Session cookie | `{items:[...]}` containing only that person's records |
| `GET /api/wardrobe/items/:id` | Owner session | Persisted garment record with its retrievable `photo_url` |
| Garment/asset access | Another user's or anonymous session, read/update/delete/photo URL | 401/403/404; original record unchanged |
| Photo URL | Owner session | An actual decodable image, at least 100 pixels per side, visually matching the uploaded shirt after resizing/re-encoding |
| `POST /api/outfits` | `{occasion:"dinner",weather:"mild",dress_code:"smart-casual"}` | One explained outfit whose item IDs are in the wearer's wardrobe |
| Missing outfit facts | `weather:"unknown"` or `dress_code:"unknown"` | `{outfits:[],question:"..."}` or `{outfits:[],abstention:"..."}` |

Every complete outfit has top, bottom and footwear categories. Each referenced record is owned, available, confirmed to fit, and has confirmed weather and dress-code facts matching the request. No item outside the wearer's wardrobe may be included. With one shirt, or with unknown weather or dress code, the API returns `{outfits:[],question:"..."}` or `{outfits:[],abstention:"..."}`. The checker requires exactly one nonempty question or abstention and no outfit in those cases. Its complete-set proof uses three licensed real photos; its browser journey separately proves the one-shirt alternative. It checks factual constraints, not fashion quality or ranking.

No exact inference label, internal database structure, component name, scoring implementation or model provider is asserted. Where the product's published transport contract differs, firstmate can reconcile the projection while retaining the behavioral requirement and its bad-variant proof.
