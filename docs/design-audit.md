# Design audit of app.getyourfit.co

Recorded on 2026-10-18 in headless Chrome against the live `https://app.getyourfit.co`, using a disposable account that was deleted afterwards. Screens were driven through real browser controls and measured at 390, 768, and 1440px. The public page and account entry came from the [front-door increment](product-quality-proof.md). The signed-in wardrobe, garment upload, outfit, starter plan, and account screens still used the legacy private styles that [DESIGN.md](../DESIGN.md) listed as a migration boundary.

Each screen was scanned with axe-core 4.11 (WCAG 2.0, 2.1, and 2.2 A/AA plus best practices) and a DOM measurement of visible text and interactive targets. Lighthouse 13.4.1 audited the public and signup pages. Screenshots and raw reports stay with the task evidence, outside the repository.

## Measured baseline

| Screen (390px) | Page height | `h1` count | Text under 14px | Smallest text | Font sizes | Font families | Uppercase labels | Targets under 44px |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public | 1415px | 1 | 0 of 38 | 14px | 6 | 1 | 0 | 0, excluding inline links |
| Sign up | 1172px | 1 | 0 of 15 | 14px | 5 | 2 | 0 | 0 of 7 |
| Empty wardrobe | 4335px | 2 | 36 of 71 | 8px | 15 | 3 | 5 | 9 of 28 |
| Garment upload, photo reviewed | 6149px | 2 | 70 of 105 | 8px | 16 | 3 | 6 | 17 of 43 |
| Wardrobe with three garments | 5644px | 2 | 111 of 146 | 8px | 15 | 3 | 8 | 12 of 37 |
| Outfit result | 7189px | 2 | 124 of 166 | 8px | 15 | 3 | 9 | 12 of 40 |

At 1440px the signed-in screens used 17 to 18 font sizes, from 8px to 64px. axe reported zero violations on every screen, so automated WCAG scans alone could not detect these defects.

Lighthouse, mobile and desktop presets:

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| Public, mobile | 84 | 100 | 92 | 100 |
| Public, desktop | 100 | 100 | 92 | 100 |
| Sign up, mobile | 96 | 100 | 92 | 63 |
| Sign up, desktop | 100 | 100 | 92 | 63 |

Best practices lost points to a console error: the edge injects a Cloudflare Web Analytics beacon that the app's `script-src 'self'` policy blocks. That beacon is host configuration, outside this repository. The sign-up SEO score reflects its intended `noindex`.

## Defects

### Typography

1. Three type families on one screen. Private headings used a serif stack (Iowan Old Style, Baskerville, Georgia), labels used `ui-monospace`, and body text used Manrope. The public page and DESIGN.md specify Manrope only.
2. Text from 8px to 13px carried real content: monospace uppercase eyebrows at 8 to 10px ("YOUR OWN CLOTHES, FIRST", "ONE DECISION", "ACCOUNT CONTROL"), account explanations at 10px, garment details and Edit/Remove actions at 12px, and inputs at 13 to 14px.
3. No scale. 15 to 18 distinct sizes per screen, including 19, 22, 29, 30, 34, and 38px headings with no shared ratio.
4. Raw enum values were shown as copy: lowercase `mild`, `casual`, `smart-casual` in weather and dress-code options, garment cards, and the garment form.

### Hierarchy and layout

5. Wardrobe, starter plan, outfit, and account settings were stacked on one page 4,300 to 7,200px tall on a phone. Account settings had a second `h1` ("Your account, in your hands.") below the wardrobe `h1`.
6. Three content widths (1080px, 760px, 840px) shared one page, so section edges did not align.
7. Sign-in and sign-up used a split screen whose left half held only a repeated brand name, a 64px `h1` reading "GetYourFit", and a back link. The task heading was an `h2`.
8. With an empty wardrobe, the full starter-plan form opened by default and was taller than the wardrobe itself, while the empty-state guidance used a decorative "01" numeral.
9. The outfit result appeared below the form without moving focus. It repeated full-size garment photos already in the wardrobe grid, and each photo carried a full-width "Don't use this for this occasion" button.
10. A decorative arrow icon sat beside the outfit heading with no action.

### Color and components

11. Primary buttons were near-black (`#1D2724`) on private screens and deep green (`#285342`) on the public page. Secondary buttons, cards, and input borders used ad-hoc warm grays (`#D5D0C6`, `#DEDAD1`, `#FAF8F3`, `#D7D2C8`) outside the documented cool palette.
12. Private screens used nine or ten distinct text colors, including undocumented grays such as `#626158`, `#63635A`, and `#5F5E56`.
13. Two brand marks: a square sans "g." on the public page and a round serif "g." with an uppercase monospace "GETYOURFIT" wordmark on every other screen.
14. Corner radii varied between 4, 5, 6, 7, 8, and 20px, and controls used 41px, 44px, 45px, and 48px heights.

### States

15. Signup marked the unchecked 18+ checkbox `invalid` before any submission.
16. Opening the garment editor left focus on `<body>`, and closing it did not restore focus to "Add garment".
17. Photo review exposed developer provenance as primary copy: "Photo label: clothing · 4.4% classifier score. Apple Vision · VNClassifyImageRequest revision 2". Saved garments repeated "model version null, confidence 1" inside "Fact sources".
18. The empty file input rendered as the browser's default "Choose File / No file chosen" control.
19. The account page showed the security setup as "Set up TOTP" with uppercase monospace labels.

### Responsive

20. At 390px the signed-in header wrapped the email and nav onto two rows with 33px-tall nav links, and the account cards indented buttons by a fixed 51px.
21. Garment cards collapsed to one column of 4:3 photos at 390px, each followed by three rows of 12px metadata.

### Keyboard and screen reader

22. Seven nav, disclosure, and account controls were under 44px tall (33 to 41px), below the documented minimum.
23. Two `h1` landmarks and heading levels that skipped from `h2` cards to `h4` outfit items obscured the page outline for screen readers.

### Copy

24. Headings were slogans rather than tasks: "A wardrobe worth knowing.", "Make it yours.", "Your account, in your hands." The page title was the same on every route.
25. Status and limits sentences carried implementation language: "Confidence 1 means you explicitly confirmed the fact; it is not an AI score."

## Remedies and proof

The redesign that follows this audit ships tokens, a type scale, and shared components, and applies them to account entry, garment upload, and outfit suggestion. The `quality` CI check then enforces the measurable items above on every rendered screen and width: zero axe WCAG 2.2 AA violations, no visible text under 14px, one type family, one `h1`, interactive targets of at least 44px, no horizontal overflow, and a visual-regression comparison. Before and after measurements are recorded in [product-quality-proof.md](product-quality-proof.md).
