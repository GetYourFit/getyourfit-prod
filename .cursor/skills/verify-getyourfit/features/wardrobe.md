<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Add and correct real garments

Give photo permission, resize in the browser, review a local clothing label, confirm facts and keep a private owned wardrobe.

## Sub-features

- photo-consent disables image selection until local processing and storage are authorized.
- photo-review resizes to 1200 pixels, strips metadata and rejects malformed image bytes before on-device recognition. Only saving uploads the photo.
- photo-classification uses pinned FashionCLIP in a browser CPU/WASM worker without WebGPU, with an honest clothing label, revision and score; downloading or unavailable classification allows immediate manual confirmation.
- wardrobe-create stores confirmed category, color, size, fit, availability, weather and dress code privately with the photo.
- wardrobe-correction preserves source and records changed facts as wearer-correction.
- wardrobe-remove erases one garment photo and facts and cascades its outfit exclusions.

## How to get to it (user POV)

- Sign in and choose Add garment.
- Confirm ownership and photo permission before selecting a real JPEG, PNG or WebP.
- Review the photo, complete the garment facts, and choose Save garment. Use Edit details to correct any fact.

## Driving it with chrome-devtools-axi

Preconditions:

- Sign in to an adult account. Use tests/fixtures photographs only in an isolated verification account; never seed a real wearer wardrobe.

- **Permission.** Choose Add garment. Confirm Garment photo is disabled until photo consent is checked.
- **Known bad.** Upload tests/fixtures/damaged.jpg. The browser announces the decode failure, Save remains disabled, and no /api/wardrobe/review request is sent.
- **Valid photo.** Upload a licensed real fixture. The preview loads. When recognition succeeds, the photo label includes FashionCLIP, its pinned revision, and its actual score. Use npm run verify:classification to test real inference, no WebGPU, slow-network manual entry, deadlines and worker failure. Confirm the category yourself, plus name, color, labelled size, current fit (or unknown), availability, weather and dress code. Confirm ownership and save.
- **Correction.** Edit a detail and save. Refresh: the photo and corrected detail remain. The export records source wearer-correction, modelVersion null, confidence 1 for that changed fact.
- **Remove.** Choose Remove, then Yes, remove. The garment and photo disappear; it cannot appear in an outfit.
- **Proof.** npm run verify:wardrobe drives these production controls and probes private image ownership using a second account.

## Gotchas

- A photo cannot establish ownership, fit, weather or dress code. No classifier score becomes an outfit fact automatically.
- Browser recognition downloads about 154 MB of model weights from Hugging Face without sending the photo there. Failed, skipped, timed-out or unsupported recognition has no invented label or score. Apple Vision is an optional API path with GYF_CLASSIFIER=apple-vision on macOS with Swift.
- A wardrobe holds up to 50 photos, with bounded decode size and stored JPEG images. Photos never use an external image or recognition service.
