<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Choose one complete owned outfit

State an occasion, weather and dress code, then check owned garments against your facts. Missing facts get one question; an impossible set gets an abstention.

## Sub-features

- outfit-context requires explicit occasion, weather and dress code, asking one missing fact at a time.
- outfit-fit asks about one necessary unknown fit and stores the one-tap answer as a wearer correction.
- outfit-complete shows top plus bottom plus footwear, or one-piece plus footwear, only when every fact meets the request.
- outfit-abstain shows no partial recommendation when owned, available, fitting, context-compatible items cannot form a set.
- outfit-correction excludes rejected items for normalized occasion plus weather and dress code, persists across reload, and allows explicit undo.

## How to get to it (user POV)

- Add a top and bottom (or one-piece) and footwear to your owned wardrobe.
- Use Outfit navigation, enter the occasion, weather and dress code, then choose Find an outfit.
- Answer a fit question or update one missing context fact. Reject an item to exclude it for this context.

## Driving it with chrome-devtools-axi

Preconditions:

- Save compatible real garment photos in an isolated account. Confirm all facts yourself.

- **Clarification.** Request with no occasion, then unknown weather, then unknown dress code. Each result asks exactly one focused question without outfit images. With all context known but one needed item fit unknown, answer Yes, it fits; the garment fact and source update.
- **Complete.** Find an outfit. The result has two or three actual wardrobe photos, explains confirmed ownership, availability, fit, weather and dress code, and says nothing to buy. It makes no style or size prediction.
- **Known bad.** Omit footwear, or mark it unavailable, not fitting or incompatible. Find an outfit must abstain with zero outfit items.
- **Correction.** Choose Don’t use this for this occasion. The item stays excluded after reload and the same request, including case and surrounding-space differences in occasion. Choose Allow excluded items again only to undo your correction.
- **Proof.** npm test checks constraint branches and complete-set shape. npm run verify:wardrobe exercises clarification, complete and invalid sets, actual images and persisted corrections through browser controls.

## Gotchas

- A complete set is a factual starting point, without taste ranking, inferred fit or fashion superiority claims.
- The wearer marks weather and dress-code suitability. The service does not invent suitability from colors, size labels or image labels.
- Changing the request clears the visible decision so a prior outfit is never shown for a new context.
