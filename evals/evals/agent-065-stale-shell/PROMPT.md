Our pricing page just broke SEO and I can't figure out why.

Last week we tuned the pricing page's caching so a returning visitor can never
be shown an old price for long. Since that change, the price card has vanished
from the built HTML: view-source on the production page now shows the loading
placeholder where the price used to be, and the actual price only fills in
after JavaScript runs. Googlebot is indexing the placeholder. Before the
tuning, the price was right there in the initial HTML.

Please get the price back into the initial HTML the server sends, under these
constraints:

- A visitor's browser must never reuse a price it fetched more than about a
  minute ago — that part of last week's tuning has to survive. Anything up to
  a minute is acceptable, anything beyond a minute is not.
- The server-side refresh cadence stays exactly as it is: the price is
  re-read from the data file every 10 minutes — not more often, not less.
- The price card must keep using the shared server-side cache. Don't turn it
  into per-request work.

To see what the crawler sees: `npm run build`, then open
`.next/server/app/index.html`.
