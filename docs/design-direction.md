# GetYourFit design direction

Written on 2026-10-14 before UI changes. This is the direction for the public first screen and the subsequent wardrobe-to-outfit journey. It does not claim that the redesign or its measurements have shipped. [Requirements](requirements.md) remain the capability boundary; [PRODUCT.md](PRODUCT.md) contains the wider product intent.

## Audience and value

Design for a wearer with an occasion in mind, using a phone near their wardrobe. They need to see an understandable outcome before investing in an account or entering garment facts. This scene is a design assumption from the task, not a user-research finding.

**Get one complete outfit, with the reasons, from the clothes you already own.**

The product checks facts the wearer confirms. It does not currently judge taste or predict fit. Put that distinction beside the explanation and photo review, where it affects a decision.

## Reference study

The following primary pages were reviewed on 2026-10-14. Borrowing is our design judgment, not an endorsement or evidence about those products' users. No reference brand's photographs, logos, copy, or interface assets will ship in GetYourFit.

| Primary page | What is borrowed | What is not borrowed |
| --- | --- | --- |
| [Anthropic's Claude overview](https://claude.com/product/overview) | Concrete tasks and their resulting artifacts establish value; a clear primary action follows. Give the outfit and its reasons the same status. | Simulated chat, enterprise examples, news overlays, floating decorative tiles, and the brand's typography. |
| [OpenAI's ChatGPT overview](https://chatgpt.com/overview/) | Explain useful everyday outcomes with actual product examples before asking someone to start. Give returning users a separate sign-in path. | A general assistant input, provider claims, capability menus, or copied conversation examples. |
| [Apple's iPhone surface](https://www.apple.com/iphone/) | Large product photography, a decisive type hierarchy, short explanatory passages, and space around the object being considered. | Hardware marketing claims, autoplay video, glass treatments, and a large retail navigation. |
| [Linear's product surface](https://linear.app/) | Demonstrate the product at useful scale, maintain precise spacing, and separate the primary task from navigation. | Dark developer-tool styling, dashboard density, sidebars, telemetry, and ornamental gradients. |
| [Airbnb's public surface](https://www.airbnb.com/) | Start with the visitor's task and make the account a supporting action. Its loading search surface also preserves the control's shape. | Marketplace filters, promotional clutter, pricing, and location discovery. |
| [Pinterest's public introduction](https://about.pinterest.com/) | Real images make the proposition tangible; photographs deserve space and recognizable detail. | Infinite discovery, a distracting masonry feed, shopping, and engagement mechanics. |
| [Vestiaire Collective](https://www.vestiairecollective.com/) | Garment identity, category, and descriptive facts accompany the visual object. Offer photo assistance and manual correction as distinct paths. | Commerce, discounts, designer prestige, authenticity claims, and promotional urgency. |

Claude, Apple, Linear, and Pinterest were inspected in Chrome. ChatGPT and Vestiaire showed browser access challenges; their primary-page content was reviewed without bypassing those challenges. Airbnb's browser capture remained in a loading state, so its finished visual hierarchy is not claimed as inspected. No authenticated competitor flows were studied.

## Chosen direction: the outfit, explained

The visual center is a complete arrangement of real garments and a short explanation. The page should read as a useful personal clothing product, with the care and clarity of the references, rather than a login form or an AI dashboard.

Seven structures were considered: a wardrobe flat lay, a fitting-room sequence, an explained outfit composition, a personal photo album, clothing-label fact summaries, a fashion spread, and a collection gallery. The explained composition best joins the first value moment to the private wardrobe and supports correction without changing visual language. The others contribute photographic scale, simple sequencing, and legible facts; they do not become decorative motifs. The design study's direction seed was `1d1d28e4`, assigned candidate 3.

The foreign directions from the study lose product clarity: constructed type grids, painted posters, industrial textile quotations, architectural sections, risograph layouts, and laboratory counters would compete with actual clothing. Keep their disciplines of alignment, commitment, and structural honesty. The user's product-quality brief takes precedence over their visual motifs. Implementation is code-led with real photographs; generated clothing or generated page artwork is excluded.

### Direction contract

**Thesis:** Show one complete outfit and its reasons before account creation. The garment arrangement is the proposition.

**Own-world:** Cool near-white canvas, dark green-black type, white photo surfaces, one deep green action color, clear sans-serif type, and restrained corners. Real garments supply the color and texture.

**Story:** Understand what the product can do, inspect a labeled worked example, understand where photos go, then choose **Build my wardrobe**. Returning wearers can choose **Sign in** directly.

**First viewport:** A compact header, one value statement, and a composed outfit occupy the first view. At 390px, the complete garment set and primary action remain reachable without a long marketing preamble. At 768px and 1440px, photographs gain scale and the explanation sits alongside or immediately beneath the arrangement. There is no row of interchangeable feature cards.

**Form:** Explained outfit composition, candidate 3, seed `1d1d28e4`. The signature interaction is inspecting the outfit's reasons, then starting with one's own wardrobe. It does not imitate a conversation.

**Finish:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Type scale

Use self-hosted Manrope with system sans-serif fallbacks. Its [font log](https://github.com/google/fonts/blob/main/ofl/manrope/FONTLOG.txt) identifies the designers and variable weight support. Ship its license and font log with the actual font asset. No runtime font request goes to a third party.

| Role | 390px | 768px | 1440px | Weight / line height |
| --- | --- | --- | --- | --- |
| Public value statement | 40px | 52px | 64px | 600 / 1.08 |
| Outfit or page title | 32px | 40px | 48px | 600 / 1.15 |
| Section title | 24px | 28px | 32px | 600 / 1.2 |
| Garment title | 20px | 20px | 22px | 600 / 1.3 |
| Main explanation | 18px | 20px | 20px | 400 / 1.5 |
| Body, labels, inputs, buttons | 16px | 16px | 16px | 400 or 600 / 1.5 |
| Helper text and photo credits | 14px | 14px | 14px | 400 / 1.5 |

Use sentence case. Keep long text within 65 characters per line. Headline tracking may reach -0.035em; body tracking stays normal. Inputs remain at least 16px on phones. Replace tiny uppercase monospace labels and version labels with readable task language. Each page has one primary heading; subsequent section headings follow its hierarchy.

## Color and contrast

The light surface follows the use scene: a wearer inspecting clothing and entering facts in ordinary room light. The restrained palette lets their photographs lead.

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F7F8F5` | Page background |
| Surface | `#FFFFFF` | Photo and input surfaces |
| Ink | `#1D2724` | Primary text |
| Muted ink | `#56645D` | Helper text, placeholders, secondary text |
| Action | `#285342` | Primary action, links, focus |
| Action hover | `#183B2E` | Active primary controls |
| Rule | `#DDE3DF` | Decorative separators |
| Control boundary | `#7F8F85` | Required visible input outlines |
| Error ink / surface | `#9F392F` / `#FFF3F0` | Errors with text and a recovery action |
| Warning ink / surface | `#75520D` / `#FFF7DF` | Warnings with text |

The following sRGB relative-luminance calculations were checked before implementation. Ratios are displayed rounded; comparisons use their full values. [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) requires 4.5:1 for normal text and 3:1 for large text. All text pairs below exceed the normal-text threshold.

| Pair | Contrast |
| --- | --- |
| Ink on canvas | 14.40:1 |
| Muted ink on canvas | 5.83:1 |
| Muted ink on white | 6.22:1 |
| White on action | 8.73:1 |
| Action on canvas | 8.19:1 |
| Error ink on error surface | 6.23:1 |
| Warning ink on warning surface | 6.61:1 |
| Control boundary against white | 3.40:1 |

Palette arithmetic is not page conformance. The production-built acceptance scans must verify actual rendered text, including helper text, errors, and placeholders. Do not communicate state through color alone. Focus uses a 3px action outline with a 3px offset and must remain visible on every surface.

## Spacing, corners, and composition

Spacing tokens are `4, 8, 12, 16, 24, 32, 48, 64, 96px`. Use 8-12px inside a label/control group, 16-24px between related controls, and 48-64px between tasks. Phone gutters are 24px; tablet gutters are 32px; desktop content is capped at 1240px with at least 48px side space. Breakpoints follow content at 600px and 1000px, verified at the three requested widths.

Radius tokens are `0, 8, 12, 16px`: 8px for controls, 12px for photographs, and 16px for a genuinely grouped panel. Use borders for controls and modest separators for sections. Avoid nested cards, repeated framed sections, hard shadows, and decorative pills. A garment grid is a photo collection, not a set of feature cards.

All primary controls and standalone links have at least a 44px touch area; primary actions use 48px. The example composition shows a complete set together. Use `object-fit: contain` where cropping could conceal a garment's identity. The outfit result gives photographs more space than its context form; the reasons are readable prose, followed by a correction action.

## Motion and states

Use 120-180ms color and opacity transitions for controls. State changes may use one 180ms opacity transition after the content is available. No entrance animation delays the first image, controls, or explanation. No autoplay, parallax, animated typing, floating garments, or shimmer is required.

With `prefers-reduced-motion: reduce`, remove transitions and spinner rotation. Keep a written loading message. Reserve image dimensions and result space before loading; measure layout shift rather than assuming it is absent.

Empty wardrobe: explain the first useful step and offer **Add a garment**. Loading: identify the operation through a status announcement. Failure: retain the entered information, explain what failed, and offer a direct retry. Save: announce the result and restore focus to the next useful control. Opening signup or a garment editor moves focus to its entry point; closing it restores focus to its trigger. Labels and helper text remain associated with their inputs. Signup submits through both a touch action and Enter.

## Imagery and honest examples

Use real licensed garment photographs or the wearer's consented photographs. No generated garments, stock avatars, synthetic reviews, inferred customer outcomes, or copied competitor photography.

The current repository has CC0 Wikimedia photographs documented in [acceptance attribution](../tests/acceptance/fixtures/ATTRIBUTION.md) and [verification attribution](../tests/fixtures/README.md). No Met photographs were found in this checkout at the start of the study. Additional [Met Open Access photographs](https://www.metmuseum.org/hubs/open-access) may be used only after checking the individual object record's public-domain status and recording its source. Museum or demonstration garments must not imply ownership by the visitor.

Every public photograph ships with a source URL, creator or collection, license, original file hash, and a note about resizing or cropping. Optimization can change encoding and dimensions, not the depicted garment. Keep originals or source records available for review. Public example images stay separate from private uploads and are never inserted into an account's wardrobe.

The first screen labels the set **Example outfit** and explains that its context and confirmed facts are illustrative. It demonstrates the current factual decision, not learned taste or fit prediction. The primary action leads to creating a private account and building one's own wardrobe, including the zero-garment path.

## Privacy language

For the hosted product, photographs travel from the browser to the GetYourFit server that holds the private account. Classification runs there; photos do not go to an external AI service. Explain this in plain words before upload consent. Do not say hosted data stays on the wearer's phone. Export and deletion remain visible account actions.

User copy excludes release numbers, **Local Edition**, **local app**, provider setup details, and developer-only provenance fields. A disabled recovery service is described as **Password reset isn't available here. Keep your password safe.** It does not promise a future release date. Technical provenance remains available in a secondary details view when useful.

## Increment order and proof

1. Public first screen: worked example, plain privacy explanation, **Build my wardrobe**, and a separate sign-in path. Account creation follows the value moment.
2. Private outfit result: composed photographs, designed explanation, and clear correction.
3. Shared controls across wardrobe, photo review, facts, outfit, and privacy; fix the reproduced focus and recovery defects.
4. Measure classification cold start before and after its separate performance change.

Each UI PR records before/after screenshots at 390px, 768px, and 1440px from the production build. Record Lighthouse performance, accessibility, and best-practices scores with its version and settings. Targets are performance at least 90, accessibility 100, best practices 100, and measured CLS 0; these are targets, not current results. Keep the required acceptance and quality checks green. Extend mandatory WCAG AA scans and give each repaired behavior a targeted known-bad variant. A score alone does not prove keyboard, screen-reader, or submit behavior; drive those flows directly.

Review one complete capture batch, fix the concrete defects it exposes in one batch, and confirm at most once. Record unresolved limits honestly. Rewrite DESIGN.md from the implemented system after the first redesign increment, so documentation describes the built product.
