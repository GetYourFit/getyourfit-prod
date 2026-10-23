---
name: GetYourFit
description: Complete outfits, real clothes, decisions worth keeping.
colors:
  canvas: "#f6f1e9"
  surface: "#fff"
  surface-muted: "#ede7dd"
  ink: "#30252d"
  ink-muted: "#655b60"
  accent: "#a33b24"
  accent-hover: "#7f2b19"
  accent-subtle: "#f5e5da"
  accent-border: "#cca698"
  shell: "#362633"
  on-shell: "#fff8ee"
  shell-muted: "#d4c4cf"
  highlight: "#e9f29d"
  on-accent: "#fff"
  rule: "#dcd2ca"
  control-border: "#91817e"
  danger: "#9f392f"
  danger-hover: "#7f2c24"
  danger-surface: "#fff3f0"
  danger-border: "#ecc5bd"
  warning: "#75520d"
  warning-surface: "#fff7df"
  warning-border: "#e7d29b"
  selection: "#e9f29d"
typography:
  display: { fontFamily: "Manrope, sans-serif", fontSize: "clamp(42px, 5.2vw, 74px)", fontWeight: 500, lineHeight: 1.04, letterSpacing: "-0.035em" }
  page: { fontFamily: "Manrope, sans-serif", fontSize: "32px / 40px / 48px", fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.035em" }
  section: { fontFamily: "Manrope, sans-serif", fontSize: "24px / 28px / 32px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em" }
  title: { fontFamily: "Manrope, sans-serif", fontSize: "20px", fontWeight: 600, lineHeight: 1.3 }
  body: { fontFamily: "Manrope, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: 1.5 }
  caption: { fontFamily: "Manrope, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: 1.5 }
rounded: { control: "6px", photo: "12px", panel: "12px", pill: "999px" }
spacing: { xs: "4px", sm: "8px", compact: "12px", base: "16px", group: "24px", panel: "32px", section: "48px", wide: "64px", major: "96px" }
components:
  button-primary: { backgroundColor: "{colors.accent}", textColor: "{colors.on-accent}", rounded: "{rounded.control}", height: "48px" }
  button-secondary: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.control}", height: "48px" }
  input: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.control}", height: "48px" }
---

# Design System: GetYourFit

## Overview

A fashion contact sheet translated into a working wardrobe: warm paper, plum navigation, rust actions and fully visible garments. Public entry persuades through a real complete example and two concrete jobs. Private screens prioritize operating the wardrobe. The [direction contract](docs/design-direction.md) owns surface strategy, research and the journey matrix. Product truth lives in [PRODUCT.md](PRODUCT.md).

## Colors

Plum identifies the public demonstration and private navigation; warm paper carries working content. Rust identifies actions, links and selection. Citron gives the public primary action and private active navigation contrast against plum. White stays reserved for photographs and inputs. Muted ink is for supporting copy. Error and warning colors always accompany words and icons.

The normative source in code is [tokens.css](src/styles/tokens.css). These frontmatter values are extracted from it. Palette arithmetic does not prove WCAG conformance; the rendered quality suite checks contrast and semantic accessibility.

## Typography

Self-hosted Manrope is the only family, with system fallbacks and optional font display. Its license remains in [font provenance](public/fonts/provenance.json). Medium display and page headings contrast with semibold section headings. Body and inputs stay at least 16px; captions and labels at least 14px. Headline tracking stops at -0.035em. Every screen has one h1; disclosures retain meaningful titles. Long supporting text is capped around 65 characters.

## Layout

Content is capped at 1240px; gutters are 24px, 32px and 48px across the existing 600px and 1000px type breakpoints. Public entry pairs job choice with a complete outfit, stacking below 760px. Private navigation is a plum top bar and becomes two rows on phones. Account entry pairs a contextual panel with its form, stacking below 760px. Long garment grids use two columns on phones, with wrapping facts and explicit actions. The saved visitor plan remains before the wardrobe. Account settings use separated rows rather than a dashboard of cards.

## Elevation & Depth

The system uses flat tonal areas and fine dividing rules. Only the modal has a soft shadow and a dim plum backdrop. Outfit boards are white image wells without shadows. Focus rings are structural, visible on the surface beneath them, including citron on plum.

## Shapes

Controls have compact corners; photograph and panel corners are quieter. Small chips may be pills. Large garment lists and settings rows are open, separated by rules. No decorative masks crop garment identity. Native modal dialogs fill the phone viewport and scroll internally.

## Components

- **Actions:** Primary, secondary, ghost and danger variants retain explicit labels and 48px primary targets. Public entry uses citron on plum. Busy controls keep written progress; disabled controls retain their labels.
- **Fields:** Native inputs, selects and checkboxes keep associated labels, hints, focus and error state. White inputs contrast with paper. Selection, carets and scrollbars use the palette.
- **Look comparison:** The public strip and saved boards expose selected state with aria-pressed. Changing a look reveals the complete composition over 220ms; reduced motion removes the reveal. Selection survives the existing visitor-to-account save boundary.
- **Wardrobe:** Role counts show actual items added, without claiming eligibility. Name/colour search and category filtering show a result count and a clear action when nothing matches.
- **Notices and disclosures:** Written errors and retries remain next to the relevant task. Technical provenance, needs editing and shopping limitations stay in existing disclosures. Error and result focus behavior is preserved.
- **Garment review:** The existing consent, image review and correctable facts remain in a focused native dialog. Model progress and manual confirmation are different states; manual details do not prove recognition.

## Do's and Don'ts

- Do show licensed real garments and retain source attribution. The original photographic backdrops in shared/outfit-board.ts are intentional image-specific exceptions to UI tokens.
- Do label public examples and keep private accounts empty until a wearer adds garments.
- Do keep exact facts, styling judgment, fit evidence and commercial availability distinct.
- Do retain form input, focus restoration, status announcements and useful retries.
- Don't use typography below 14px or remove keyboard focus.
- Don't invent wearer data, fit predictions, testimonials, growth or stock claims.
- Don't turn a source-level check into evidence that the deployed product passed. Linux visual baselines and independent release checks belong to the delivery pipeline.
