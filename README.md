# GetYourFit

GetYourFit is a private wardrobe companion: choose an explained outfit from clothes you own, or use [Build my wardrobe](#build-my-wardrobe) to plan clothing needs when starting without garments. "You already own it" is a useful result. This v0.1 increment connects local accounts, garment review, a compact wardrobe, a factual outfit check, starter plans, wearer corrections, export, and deletion. Data is stored in a local SQLite file by default; setting `DATABASE_URL` opts in to Postgres, which production will use on Supabase's free plan ([Supabase](docs/supabase.md)). It is not yet a deployed service, nor a validated style or fit model.

For outfits from owned clothes, create an adult account with email and password, then add your own garment photos with permission. The browser resizes and strips metadata, then recognizes the garment on your device with FashionCLIP using CPU/WASM, including on Linux-hosted apps and browsers without WebGPU. First use downloads about 154 MB of model weights from Hugging Face; the photo stays on your device until you save it to your private GetYourFit account. You can skip recognition and confirm facts immediately. Unavailable or uncertain recognition also falls back to manual confirmation. See [photo recognition](docs/photo-recognition.md) for model provenance, privacy, limitations, and acceptance checks. Every outfit fact comes from the wearer. The owned-clothes outfit check requires an occasion, weather, dress code, availability, and confirmed fit; it asks one question when a required fact is unknown and abstains when no complete set exists. A rejected item stays excluded for the same context until you allow it again.

No email is sent: sign-up needs no confirmation, and a forgotten password cannot be reset by email yet; a signed-in wearer can change it from Account ([Email](docs/supabase.md#email)). Privacy controls export photos and facts with provenance and corrections, or delete them with the account. Photos and facts are never sold or used for model training. There is no sharing, external recognition service, body inference, buying flow, or seeded wardrobe.

## Try it without an account

**Plan an outfit now** on the home page opens `/plan`, where a visitor answers occasion, weather, outfit form, budget and an optional dress code, then sees a complete outfit with no account. The result is an outfit board: one square composition of real garment photographs (a top, a bottom and footwear, or a one-piece and footwear), a switch between the capsule's looks, the reasons, and **Download as image**, which draws the same board as a PNG in the browser. A role the visitor marks owned in the account flow shows as a "your own" tile instead of a photograph. Photographs are modern garments from Wikimedia Commons and Pexels under their recorded redistribution licences, with each licence, source and hash recorded in `public/example/provenance.json`. They are stand-ins, and the page says so. Attribution and licence links accompany the page and downloaded board.

The answers are not sent to a server while planning (only the anonymous counters below), and no photo goes to any external AI service. **Save this plan** explains private server storage and keeps the answers and chosen look while you create an account or sign in. The plan saves after account entry without a second save action. Its chosen board appears before the wardrobe and outfit form, with **Download as image** and a disclosure for plan details. Saved plans retain the chosen look through refresh and return. A failed load offers a retry that restores the saved result and clears the load error.

Pending saves stay in this tab's session storage until persistence succeeds. If storage is blocked, account entry retains the draft in memory; keep the tab open until saving finishes. Failed saves retain the chosen board and offer **Try saving plan again**. Retrying a save whose response was lost returns the same plan rather than creating a duplicate.

Drop-off is measured with anonymous daily counters in the local database: `plan_opened`, `plan_submitted`, `outfit_shown`, `save_prompt_shown`, `save_prompt_accepted` and `plan_saved_after_visit`. The `funnel_counts` table holds only a UTC day, a step name and a number: no cookie, identifier, IP address or plan content, and no third-party tracker. Browsers that send Do Not Track or Global Privacy Control are not counted. Run `npm run funnel` with the same `GYF_DATA_DIR` and `BETTER_AUTH_SECRET` as the server to read the totals and step rates.

## Build my wardrobe

Create or sign in to your GetYourFit account, then choose **Build my wardrobe** beside **Add garment**. Planning needs no garment upload or account at another service. The owned-clothes outfit path remains available.

Enter one occasion, a spending ceiling and currency (INR by default), and an outfit form. Add weather, dress code, and any clothing requirement you know. The result includes a starter capsule: two options for each top, bottom or one-piece role and one footwear piece, mixed into up to four explained looks, with a planning budget share per piece. Capsule looks and climate guidance are general suggestions, not a verified fit or a taste prediction. Confirm only roles for which you already have a suitable item. Choose **Make my starter plan** to review a draft, then **Save plan** to keep it in your private account. You can replace a planned need's text before or after saving. **Reject plan** discards an unsaved draft and returns to planning; rejecting a saved plan keeps it in history. **Replace plan** creates a new saved plan and marks the previous one replaced. **New plan** starts another occasion, and saved plan history lets you reopen earlier results.

The result describes clothing needs, not a verified outfit or catalogue. It records your constraints but cannot verify that a garment satisfies them. The spending ceiling is split evenly across remaining planned needs in whole currency units. Any remainder goes to the first planned roles. When every role is confirmed owned, the allocated total is zero. These allocations are not prices or a promise that an outfit is within budget. Size, fit, stock, delivery costs, taxes, and checkout total are unverified. With a zero spending ceiling, the plan suggests reuse or borrowing without promising availability.

For a positive spending ceiling, planned needs have ordinary Google search links containing generic clothing-role terms, without your private plan details. Opening a link leaves GetYourFit and may let the destination track you. These search links are not product offers, endorsements, or affiliate links, and GetYourFit earns nothing from them.

For a plan in Indian rupees with a positive spending ceiling, **Where to shop for this outfit** names one checked shop, Decathlon India. Choose its men's or women's department; the choice only picks sections and is not saved. Each planned need with a matching section gets a link to that section, such as men's T-shirts, with that need's planning share. A section is a place to browse, not a chosen garment.

**Browse** links are affiliate links through Cuelinks: if you buy after opening one, Decathlon India may pay GetYourFit a commission. The disclosure sits beside the links, commission does not change which sections are suggested, and each linked need also has an ordinary link without affiliate tracking. Links carry no account or plan details. No product photos, prices, or descriptions are shown because Decathlon India has not given permission to display them. Item prices, delivery, taxes, and the checkout total stay unknown until Decathlon's checkout.

Plans in another currency and plans with a formal dress code get no Decathlon links. No checked section fits a one-piece garment, so a one-piece outfit gets only a footwear link when footwear is still planned. These links cannot complete that outfit. [Shopping sources](docs/shopping-sources.md) records the verification and how to refresh it.

Use **I already have this** only after confirming a suitable item is yours. Confirmation closes that plan gap and reallocates the ceiling across remaining needs. It does not create a garment record. Saved plans remain separate from owned clothes, survive reload, appear in account export, and are removed with account deletion.

## Run locally

Requirements: Node.js 22.18 or later. Local Apple Vision classification additionally needs macOS and the Swift toolchain. Enable it with `GYF_CLASSIFIER=apple-vision` for API clients. The browser uses on-device recognition by default, and failures never produce fabricated labels.

Set `BETTER_AUTH_SECRET` to a random key of at least 32 characters from your local secret store. Generate it once, retain it with the database, and reuse it on every restart. Changing it invalidates sessions and makes existing authenticator secrets unreadable. The server refuses startup without this key before opening the database. You can generate a key with `node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))'`; store its output privately, outside the repository.

By default the server keeps one SQLite file, `getyourfit.sqlite`, in `GYF_DATA_DIR` (`.gyf-data` in the checkout when unset). Setting `DATABASE_URL` to a Postgres connection string opts in to Postgres instead, applying the SQL in [migrations](migrations) at startup; in production that is the Supabase session pooler ([Supabase](docs/supabase.md#connecting)). Without `DATABASE_URL` nothing about the SQLite behavior changes.

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

To develop against Postgres, run `npm run dev:db` in one terminal (a persistent local Postgres 17 under `.gyf-data/postgres`), then `export DATABASE_URL=postgres://postgres:development-only@127.0.0.1:54329/postgres` before `npm run dev` in another.

Run `npm run verify:local-account` to prove the account path in a production build with a disposable database and random key. It checks consent, signup without email confirmation, the honest email-reset notice, a signed-in password change, wrong-password failure, restart continuity, export, and deletion through real browser controls. It uses SQLite. For Postgres, run `GYF_VERIFY_BACKEND=postgres node scripts/with-postgres.mjs npm run verify:local-account`. `npm run verify:wardrobe` takes the same switch and wrapper.

`scripts/with-postgres.mjs` starts a throwaway Postgres 17 or uses the server named by `GYF_TEST_DATABASE_URL`. `npm test` and `npm run acceptance:postgres` invoke this wrapper automatically. See [Supabase](docs/supabase.md) for the schema, the free-plan limits, the keep-alive plan, and the evaluation of Supabase Auth.

## Check

```sh
npm run lint
npm run build
npm test
npm run test:ui
npm run verify
npm run verify:local-account
npm run verify:wardrobe
npm run verify:classification
npm run acceptance
```

## Product and design decisions

- [Product contract](docs/PRODUCT.md) records product purpose, constraints, and first-slice outcome.
- [DESIGN.md](DESIGN.md) records the interface system.
- [docs/product-decisions.md](docs/product-decisions.md) records what was kept, merged, and removed from earlier GetYourFit repositories.
- [Requirements](docs/requirements.md) tracks R1-R37 and A-1 without dropping deferred work.
- [Acceptance matrix](docs/slice-1-acceptance.md) records the slice's end-to-end gates and evidence status.
- [Evidence ledger](docs/evidence-ledger.md) records research, decisions, and observed results.
- [Feature map](FEATURE_MAP.md) links to generated account, wardrobe, outfit, and data-control browser guides.
- [Workflow kit](docs/workflow-kit.md) records the pinned adoption, CI checks, and product acceptance hook.
- [Deployment inputs](docs/deploy-inputs.md) records host, vault, storage, and public-origin requirements for the deployment item.

`npm run test:ui` checks the main screens of a production build at 390, 768, and 1440px for axe WCAG 2.2 AA violations, the [design rules](DESIGN.md#quality-gate), keyboard focus, and visual regression against screenshots rendered in CI's pinned Linux image (other platforms skip only the pixel comparison). Build first with `npm run build`; Chromium comes from `npx playwright install chromium`.

`npm run verify:wardrobe` builds the production app and drives real signup, photo permission, invalid-image rejection, the licensed photographs in [tests/fixtures](tests/fixtures/README.md), facts and correction, outfit clarification and abstention, cross-account isolation, export, restart, and deletion. Set `GYF_PROOF_DIR` to a directory outside the repository to retain screenshots, snapshots, and network evidence. The verifier selects a free ephemeral loopback port with `GYF_PORT` and owns only its disposable data and named browser session. It never stops another worktree's listener.
