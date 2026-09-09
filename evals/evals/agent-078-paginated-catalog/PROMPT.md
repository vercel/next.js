Our data vendor bills us per query. `lib/db.ts` is their instrumented client —
every call it makes appends one line to `data/query-log.ndjson`, and that log
is literally the bill. The file is owned by the vendor integration team; don't
modify it.

The catalog at `/catalog?page=N` runs a fresh vendor query on every single
page view, and this month's bill exploded.

Catalog data may be up to 10 minutes stale — merchandising signed off on that.
Within that window, identical catalog views must be served from at most one
query per page number: one query serves everyone who looks at that page.

One hard constraint: our affiliate and ad links point at the `?page=N` URLs,
and they're printed in this quarter's flyers. Those exact URLs must keep
returning that page's items.

We deploy multiple instances behind a load balancer, so a module-scope map or
any hand-rolled in-process cache won't cut it. `cacheComponents` stays on.
