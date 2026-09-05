Our data-source bill exploded last month and I traced why: every single page view runs fresh queries against the data source. `lib/db.ts` is our billing-instrumented client — every call it makes appends one line to `data/query-log.ndjson`, and that log is exactly how the vendor bills us.

The pages involved:

- `/products` — the catalog list
- `/products/[slug]` — the product detail pages
- `/admin/products/[slug]` — the editor page; its Save button posts to the server action in `app/admin/actions.ts`, which writes `data/products.json`

What I need:

1. Identical page requests inside a 10-minute window must be served from at most ONE data-source query — for the catalog, for each product page, and for the admin editor too. The bill counts every query no matter which page issued it. (Product data being up to ~10 minutes stale for visitors is fine in the steady state.)
2. When an editor hits Save, the response to that very save request must already show the saved values. Our editors screenshot that confirmation for the change log; it can never show the old data.
3. After a save, the very next request for that product's page — and for the catalog — must show the new data. No grace period, no "eventually".
4. Saving product X must not throw away cached data for anything else: editing one product must not force other products to be re-queried.
5. Use the framework's caching for all of this. No bespoke in-process cache layers (module-scope maps, LRU caches, and the like) — we run multiple instances and got burned by that approach before.
6. Do not modify `lib/db.ts`.
7. Keep the admin save exactly as architected: the edit form posts to a server action (no new API endpoints), it must keep working with client-side JavaScript disabled (some of our warehouse terminals run without JS), and don't rename the form's fields — internal tooling posts to that form directly.
