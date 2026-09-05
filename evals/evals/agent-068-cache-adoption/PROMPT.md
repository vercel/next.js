We're moving our storefront to the new Next.js caching model — Cache Components. Turn it on in the config and get the whole app fully working under it. This is a real migration, not a demo: finish it end to end, and don't leave any of the previous generation's caching mechanisms behind — by the time you're done, nothing in the app should still be caching through the old ways of doing it. The build has to stay green.

Hold these requirements, and verify each one yourself before you call it done:

1. **Instant frame.** The home and products pages must keep a real prebuilt frame that is served instantly. Their prebuilt HTML must contain each page's actual heading, the site nav, and the promo/catalog content — not an empty document, and not a bare loading spinner where the content should be.

2. **Bounded staleness, deduped reads.** Catalog and promo data may be up to 5 minutes stale. Repeat requests within that window must not hit the data layer again — one query serves all of them. (The data team audits `data/query-log.ndjson`, so this is visible.)

3. **Strictly per-user.** The account and cart pages stay private to each customer. One customer's billing email or cart contents must never appear in any prebuilt output, and must never be stored in any cache or store that is shared across customers — per-customer keying inside a shared store does not satisfy this.

4. **The visible UI stays exactly as it is today.**

5. **`lib/db.ts` belongs to the data team — do not modify it.**

Take the time to actually run the app and check each requirement yourself before you're done.
