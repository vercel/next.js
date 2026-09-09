Our last performance sprint tuned caching across the storefront account area,
and it shipped two regressions. Both fixes need to go out together — this is
one release.

**1. The plan-price card broke SEO.** On the account overview page, the price
card has vanished from the prebuilt HTML: view-source on production now shows
the loading placeholder where the price used to be, and the price only fills
in after JavaScript runs, so the crawler indexes the placeholder. Get the
price back into the initial HTML the server sends. Constraints from the
sprint that must survive:

- A visitor's browser must never reuse a price it fetched more than about a
  minute ago — anything up to a minute is acceptable, anything beyond a
  minute is not.
- The server-side refresh cadence stays exactly as it is: the plan file is
  re-read every 10 minutes — not more often, not less.
- The card keeps using the shared server-side cache. Don't turn it into
  per-request work.

**2. The orders list refetches on every bounce-back.** Support agents live in
the orders dashboard (`/orders`). Navigating from the list to an order's
detail page and back refetches the whole list every time — even within a few
seconds — so the table flashes and their scroll position jumps. Keep the list
per-request fresh for new visits (it must stay dynamic — no shared caching of
its data), but let a visitor's router reuse what it just fetched for about
two minutes when they bounce back from a detail page. Scope that reuse to the
orders list page only; every other page keeps today's behavior.
