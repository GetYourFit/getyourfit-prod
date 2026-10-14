---
name: GetYourFit
description: Real clothes, one complete outfit, clear reasons.
colors:
  canvas: "#F7F8F5"
  surface: "#FFFFFF"
  ink: "#1D2724"
  muted: "#56645D"
  action: "#285342"
  action-hover: "#183B2E"
  rule: "#DDE3DF"
  control-boundary: "#7F8F85"
typography:
  display:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(40px, 4.45vw, 64px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  helper:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "8px"
  photograph: "12px"
spacing:
  compact: "8px"
  small: "12px"
  related: "16px"
  group: "24px"
  section: "32px"
  spacious: "48px"
  task: "64px"
components:
  public-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
    height: "48px"
  public-primary-hover:
    backgroundColor: "{colors.action-hover}"
  account-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.body}"
---

# Design System: GetYourFit

## Overview

The clothes carry the visual weight. A cool near-white canvas and clear sans-serif type support a composed garment set and its explanation. The interface helps a wearer understand a result and take the next useful action.

This records the implemented public page and account entry. Private wardrobe, outfit, and privacy layouts still contain legacy serif headings, compact labels, and controls; their replacement is a subsequent increment, not part of the canonical system below. The approved direction is in [design-direction.md](docs/design-direction.md); current evidence and limits are in [product-quality-proof.md](docs/product-quality-proof.md).

## Colors

Deep green marks the primary action and focus. Green-black carries main text; muted green-gray carries supporting copy. White surfaces and cool canvas leave color and texture to photographs. Separators are decorative; required control boundaries use the darker boundary color.

Muted text on canvas is 5.83:1; on white it is 6.22:1. White on action is 8.73:1. Production acceptance scans verify actual text rather than relying on palette arithmetic.

## Typography

Manrope is self-hosted with its license and provenance in [public/fonts](public/fonts/provenance.json). System sans-serif fonts are the fallback; optional font display avoids a delayed text swap.

The public headline is 40px on phones, 52px below 1000px, and up to 64px on desktop. Explanation text is 18px on phones and 20px on wider screens. Body and account inputs are 16px; captions and helpers are 14px. Sentence case and short prose preserve the hierarchy. Private legacy typography remains a migration boundary.

## Layout

Public content is capped at 1240px. Gutters are 24px below 600px, 32px below 1000px, and at least 48px above. Desktop places photographs and explanation side by side in a 1.7:1 grid. Narrow layouts stack them. The photograph arrangement keeps the top and footwear together on the left and the trousers on the right.

Spacing follows the extracted scale above. Primary controls are at least 48px tall; standalone links are at least 44px. Image dimensions are reserved and garments use `object-fit: contain`.

## Elevation & Depth

The public interface has no shadows. Photographs, spacing, white input surfaces, and fine section separators establish grouping without nested cards.

## Shapes

Photographs have 12px corners. Account controls and the primary action have 8px corners. The small public monogram has 10px corners. Keep garment outlines fully visible; rounding belongs to the image frame, not the garment.

## Components

The public primary link uses deep green, white text, 12px by 20px padding, a 48px minimum height, and a darker hover color. It transitions background color for 150ms. Focus uses a 3px action outline with 3px offset. Reduced motion removes transitions.

Native details expose example limits and photo credits. Labels describe each garment; source records are linked rather than hidden in a developer label. The example and its illustrative facts remain separate from private account data.

Account entry uses labeled native controls, 16px input text, visible password requirements, required age confirmation, and a native submit button. Opening a mode focuses its first field; failed submission focuses its alert and preserves input. Loading is announced through a status. Successful signup focuses the wardrobe heading.

## Do's and Don'ts

- Do use real licensed garments and record source, license, hashes, and transformations.
- Do label examples and illustrative facts, and start every new private wardrobe empty.
- Do describe server storage before consent; hosted photographs do not stay on a phone.
- Do keep loading and errors readable and keyboard focus deliberate.
- Don't add generated clothing, fabricated research, invented fit predictions, or testimonials.
- Don't use release labels, developer setup instructions, or model provenance as the primary product copy.
- Don't treat legacy private layouts as the redesigned component standard.
