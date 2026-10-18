---
name: GetYourFit
description: Real clothes, one complete outfit, clear reasons.
colors:
  canvas: "#F7F8F5"
  surface: "#FFFFFF"
  surface-muted: "#F0F3EF"
  ink: "#1D2724"
  ink-muted: "#56645D"
  accent: "#285342"
  accent-hover: "#183B2E"
  accent-subtle: "#E7EFE9"
  accent-border: "#B9CFC0"
  rule: "#DDE3DF"
  control-border: "#7F8F85"
  danger: "#9F392F"
  danger-hover: "#7F2C24"
  danger-surface: "#FFF3F0"
  danger-border: "#ECC5BD"
  warning: "#75520D"
  warning-surface: "#FFF7DF"
  warning-border: "#E7D29B"
typography:
  family: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  display: { fontSize: "40px / 52px / 64px", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.035em" }
  page: { fontSize: "32px / 40px / 48px", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.035em" }
  section: { fontSize: "24px / 28px / 32px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em" }
  card: { fontSize: "20px", fontWeight: 600, lineHeight: 1.3 }
  lead: { fontSize: "18px", fontWeight: 400, lineHeight: 1.55 }
  body: { fontSize: "16px", fontWeight: 400, lineHeight: 1.5 }
  caption: { fontSize: "14px", fontWeight: 400, lineHeight: 1.5 }
rounded:
  control: "8px"
  photo: "12px"
  panel: "16px"
  pill: "999px"
spacing: [4, 8, 12, 16, 24, 32, 48, 64, 96]
breakpoints: { tablet: "600px", desktop: "1000px" }
components:
  button-primary: { backgroundColor: "{colors.accent}", textColor: "{colors.surface}", rounded: "{rounded.control}", height: "48px" }
  button-secondary: { backgroundColor: "{colors.surface}", border: "{colors.control-border}", rounded: "{rounded.control}", height: "48px" }
  input: { backgroundColor: "{colors.surface}", border: "{colors.control-border}", rounded: "{rounded.control}", height: "48px", fontSize: "16px" }
---

# Design System: GetYourFit

## Overview

The clothes carry the visual weight. A cool near-white canvas, one sans-serif family, and one deep green action color support real garment photographs and plain explanations. Every screen, public or private, uses the same tokens and components. The direction and its reasoning are in [design-direction.md](docs/design-direction.md); the audit that motivated this system is in [design-audit.md](docs/design-audit.md); measurements are in [product-quality-proof.md](docs/product-quality-proof.md).

Tokens live in [src/styles/tokens.css](src/styles/tokens.css). Shared components are in [src/styles/components.css](src/styles/components.css) and [src/ui.tsx](src/ui.tsx); page layouts are in [src/styles/app.css](src/styles/app.css). Components use token variables only. The two photo-backdrop colors in the public example are the one documented exception: they match each photograph's own background.

## Colors

Deep green marks the primary action, links, selection, and focus. Green-black carries text; muted green-gray carries supporting copy. White surfaces sit on the cool canvas; the muted surface fills photo wells. Rules are decorative separators; inputs and secondary buttons use the darker control border. Danger and warning colors always come with text and an icon, never color alone.

| Pair | Contrast |
| --- | --- |
| Ink on canvas | 14.40:1 |
| Muted ink on canvas / white / muted surface | 5.83:1 / 6.22:1 / 5.56:1 |
| White on accent | 8.73:1 |
| Accent on accent-subtle | 7.45:1 |
| Accent-hover on accent-subtle | 10.52:1 |
| Danger on white / danger surface | 6.77:1 / 6.23:1 |
| Warning on warning surface | 6.61:1 |
| Control border on white | 3.40:1 |

Palette arithmetic is not page conformance. The `quality` CI check scans rendered screens with axe-core.

## Typography

Manrope is self-hosted with its license and provenance in [public/fonts](public/fonts/provenance.json), with system sans-serif fallbacks and `font-display: optional`. Seven roles cover every screen: display (public headline only), page title, section title, card title, lead, body, and caption. Sizes step up at 600px and 1000px as listed above.

Nothing renders below 14px. Body, inputs, and buttons are 16px, so phones never zoom into a field. Labels are 14px semibold sentence case. There are no uppercase eyebrows, monospace labels, or serif headings. Each screen has exactly one `h1`; section and card headings follow in order.

## Layout

Content is capped at 1240px. Gutters are 24px below 600px, 32px to 1000px, and 48px above. Pages stack sections 48px apart (32px on phones); related controls sit 16 to 24px apart, and a label sits 8px above its control. Reading text stays within 65 characters.

The signed-in app has a sticky header with the brand and four destinations: Wardrobe, Outfit, and Plan are sections of the wardrobe page, and Account is its own page. On phones the header is static and the four destinations share one row. Account entry is a single 440px panel under the brand; on phones the panel border is dropped so the form uses the full width.

## Elevation and depth

Cards and panels use a 1px rule border on white, never a shadow. The garment dialog is the only raised surface: it has the dialog shadow over a dimmed backdrop.

## Shapes

Controls use 8px corners, photographs 12px, and cards, panels, and the dialog 16px. Badges and choice chips are pills. The brand mark is a 36px square with 10px corners. Garment photographs are fully visible with `object-fit: contain` on the muted surface.

## Components

- **Button.** Primary (accent), secondary (white with control border), ghost, danger, and danger-ghost. Primary and secondary are 48px tall; ghost variants are 44px. Hover changes background or border over 150ms. Disabled buttons fade to 55% and show a not-allowed cursor. A busy button keeps its size and shows a spinner beside text.
- **Text link.** Accent, underlined, 44px tall when it stands alone.
- **Field.** `Field` in `ui.tsx` pairs a label, the control, and optional hint, linking them with `for` and `aria-describedby`. Inputs and selects are 48px tall with the control border; hover darkens the border and focus adds the 3px accent ring.
- **Check.** A 20px native checkbox in a 44px row, with optional muted detail text.
- **Choice chip.** A pill label around a native checkbox for multi-select facts such as weather and dress code. The selected chip uses accent-subtle.
- **Card.** White, rule border, 16px corners, 24px padding (32px from 600px). A card header holds a section title, description, and actions.
- **Notice.** Info, success, warning, and error tones with an icon, optional title, and body. Errors use `role="alert"` and take focus when they appear.
- **Badge.** 14px semibold pill for states: positive (fits, on), warning (fit not confirmed), danger (does not fit), neutral.
- **Disclosure.** Native `details` with a rotating chevron, for secondary information.
- **Empty state.** Dashed panel with an icon, a heading, one explanation, and the next action.
- **Dialog.** Native modal `dialog` with a header (title and Close), a scrolling body, and a footer with actions. It is full-screen on phones. Opening focuses the first useful control; Escape and Close restore focus to the trigger.
- **Drop zone.** A dashed photo target whose transparent file input covers the whole zone. It shows the reviewed photo once ready.

## States and motion

Loading is a written status, with a spinner only beside text. Empty states explain the first useful step. Failures keep entered information, say what failed, and offer a retry. Successful saves are announced through a status region and return focus to the next useful control. Results move focus to their heading, which draws no ring because it is not a control. Transitions are 150ms color and background changes; reduced motion removes them and the spinner rotation.

## Quality gate

`npm run test:ui` runs in the `quality` CI check inside a pinned Playwright image. For the public, sign-in, sign-up, sign-up error, empty wardrobe, garment dialog, reviewed photo, filled wardrobe, outfit question, outfit result, and account screens at 390, 768, and 1440px it requires: zero axe-core WCAG 2.0, 2.1, and 2.2 A/AA violations; no visible text under 14px; only Manrope; exactly one `h1`; interactive targets at least 44px tall, excluding inline links in prose; no horizontal overflow; and a full-page screenshot matching the committed baseline in `tests/ui/screenshots/linux` within 0.2% of pixels. It also checks dialog, error, and result focus. A known-bad test proves each rule fails on an injected defect. Baselines come only from the pinned Playwright image, because other platforms rasterize text differently; elsewhere the suite runs every check except the pixel comparison unless `UI_VISUAL=1` is set. After an intended visual change, take the new images from the `ui-quality` CI artifact or run `npm run test:ui:update` inside `mcr.microsoft.com/playwright:v1.63.0-noble`, review them, and commit them.

## Do's and don'ts

- Do use real licensed garments or the wearer's consented photographs, with recorded provenance.
- Do label examples and illustrative facts, and start every new private wardrobe empty.
- Do describe server storage before consent; hosted photographs do not stay on a phone.
- Do show raw values as sentence-case labels (Smart casual, Fit not confirmed), never enum strings.
- Do keep technical provenance, such as classifier model and score, in secondary text or a disclosure.
- Don't add generated clothing, fabricated research, invented fit predictions, or testimonials.
- Don't add a font family, a text size under 14px, an uppercase label, or a color outside the tokens.
- Don't nest cards or add shadows outside the dialog.
