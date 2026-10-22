# Shopping sources

[Build my wardrobe](../README.md#build-my-wardrobe) suggests retailer sections only from a verified source in [server/shopping-sources.json](../server/shopping-sources.json). The server validates that file at startup with [shared/shopping.ts](../shared/shopping.ts) and refuses to start when a record is invalid.

## Decathlon India, verified 2026-10-18

The source uses the existing GetYourFit Cuelinks publisher account. No new account, deposit, contract, or paid feed was used.

- Cuelinks channel 325006, "GYF App", source `https://app.getyourfit.co`, status approved.
- Campaign 2248, Decathlon (`decathlon.in`): access open, country India, web and mobile web allowed, deep links allowed. Allowed media include text links. Email, social media, search advertising, native ads, and pop traffic are not allowed.
- Every destination was converted with the Cuelinks `POST /links/convert` API on channel 325006. Each conversion returned `affiliated: true` for campaign 2248. The stored `affiliateUrl` values are the API responses, unchanged.
- Each destination is a Decathlon India department section, checked in a browser on the same day.

## Rights record

The record sets `productFacts`, `prices`, and `images` to `false`.

- The Cuelinks API has no product feed, product search, or product image endpoint. Its offers are coupons and deals. The [Cuelinks terms](https://www.cuelinks.com/terms) make the publisher responsible for any use of merchant intellectual property.
- The [Decathlon India terms](https://www.decathlon.in/page/decathlon-terms-and-condition) do not allow site text, photographs, or other content to be copied or republished for commercial use without written consent.
- The shipped scope is therefore section links only, with no copied prices, photos, or descriptions.

The interface reads these flags. While a flag is `false`, the page says that photos or prices are not shown and why.

## Selection rules

[Build my wardrobe](../README.md#build-my-wardrobe) owns the user-facing selection rules and unsupported outcomes. [suggestShopping](../shared/shopping.ts) implements selection from the source record.

## Refresh or add a destination

1. Confirm in a browser that the retailer section still exists. Use its canonical URL.
2. Convert the URL on the approved channel. The key comes only from the vault and is never printed:

   ```sh
   av inject +CUELINKS_API_KEY -- sh -c 'curl -s https://developers.cuelinks.com/pub_api/v3/links/convert -H "Authorization: Token $CUELINKS_API_KEY" -H "Content-Type: application/json" -d "{\"url\":\"<section URL>\",\"channel_id\":325006}"'
   ```

3. Use the response only when `affiliated` is `true` and the campaign is the expected one. Store `tracking_url` unchanged as `affiliateUrl`, then update `verifiedAt`.
4. Run the build and test commands in [Check](../README.md#check). The schema rejects extra affiliate query fields and links whose channel, retailer host, or destination differs from the source record.

When the campaign is paused, blocked, or no longer affiliated, remove the source from the file. The plan then falls back to its text needs and external search links.

## Scope decision

The operator accepted a section-links slice: no product feed and no image rights exist, so the shopping links choose no individual garments. The complete explained outfit for a zero-garment shopper is the starter plan capsule. Product selection, prices, photos and copied product text stay out until a catalogue is permitted.

## Adding a permitted catalogue

A catalogue with written product, price, or image permission adds a new destination kind beside `section` in `shared/shopping.ts`. It also sets the matching rights flags, with the grant recorded in this document. Product facts, prices, or photos must never be shown while their rights flag is `false`.
