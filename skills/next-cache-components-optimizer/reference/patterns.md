# Refactor patterns: push dynamic down into the shell

Every blocking read has the same fix shape: keep the static parts in the prerendered shell and wrap only the genuinely per-request read in a tight `<Suspense>`, or hoist it into `use cache`. The before→after for each is documented as a blocking-prerender insight:

| Blocker                                                                         | Fix                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookies()` / `headers()` / `params` / `searchParams` read outside `<Suspense>` | [Runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime)                                                                         |
| Uncached `fetch()` / database reads / `connection()`                            | [Uncached data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-dynamic)                                                                        |
| URL data (`params` / `searchParams`) blocking the shell                         | [URL data outside of Suspense](https://nextjs.org/docs/messages/instant-shell-url-data)                                                                                 |
| `useSearchParams()` / `usePathname()` and other URL hooks in a Client Component | [URL data in a Client Component](https://nextjs.org/docs/messages/blocking-prerender-client-hook)                                                                       |
| `Date.now()` / `new Date()`                                                     | [`Date.now()` while prerendering](https://nextjs.org/docs/messages/blocking-prerender-current-time)                                                                     |
| `Math.random()`                                                                 | [`Math.random()` while prerendering](https://nextjs.org/docs/messages/blocking-prerender-random)                                                                        |
| `crypto.randomUUID()` and other crypto APIs                                     | [Crypto APIs while prerendering](https://nextjs.org/docs/messages/blocking-prerender-crypto)                                                                            |
| Dynamic `generateMetadata`                                                      | [runtime](https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime) / [uncached](https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic) data |
| Dynamic `generateViewport`                                                      | [runtime](https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime) / [uncached](https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic) data |

Each insight page lists its related insights, so any one is an entry point to the rest. For **where** to place the boundary, see [Choosing where to place the boundary](https://nextjs.org/docs/messages/blocking-prerender-runtime#choosing-where-to-place-the-boundary) and the [Instant Navigation guide](https://nextjs.org/docs/app/guides/instant-navigation).

A few things those pages don't stress for the instant-navigation goal:

- **Put the boundary below the lowest layout the source and destination routes share.** A boundary in the root layout passes a page-load check but leaves sibling client navigations blocking. Prefer several per-read boundaries inside the page over one coarse layout boundary, so more real content stays in the shell and each part streams independently.
- **Keep the LCP element** (usually the main heading) out of any boundary, so it paints in the shell instead of waiting on a stream.
- **A green check isn't always instant.** `export const instant = false` opts the segment out of validation while the navigation still blocks, and a `<Suspense>` above the document `<body>` prerenders an empty shell — both quiet the signal without making the route instant. Neither is a fix.

## Can't push the read down? Runtime-prefetch the whole route

Some routes have no static shell to grow: an ID minted per request, an auth/scope read the whole subtree needs, a page that is _all_ dynamic. Instead of prerendering a shell, run the dynamic render _in the prefetch_ so the route commits real content on the click. See [Runtime Prefetching](https://nextjs.org/docs/app/guides/runtime-prefetching) for the mechanism (`prefetch = 'allow-runtime'` on the route plus a full `<Link prefetch={true}>`) and the [dynamic-data-during-prefetching insight](https://nextjs.org/docs/messages/instant-link-prefetch-partial) for adoption.

The gotchas below aren't in those docs — each cost real debugging time when driving a route to GREEN under `instant()`:

- **The full prefetch is mandatory.** With App Shells enabled an auto/PPR prefetch bails before the runtime spawn (`subtreeHasSpeculativePrefetch`); only `prefetch={true}` / `kind: 'full'` reaches it. If you set `prefetch = 'allow-runtime'` and it's still RED, the link is doing an auto prefetch.
- **All leaf slots must agree.** `allow-runtime` on the content segment but `instant = false` (or nothing) on a sibling `@header`/`@sidebar` leaf leaves the route's runtime entry incomplete, so the lock falls back to the shell. Flip every leaf together.
- **Prefetch the canonical URL.** A link whose href 307-redirects (a `/foo` that canonicalizes to `/`) can't be prefetched: the prefetch receives the redirect, not the tree. Point the link and the prefetch at the final URL.
- **Don't blanket the full prefetch.** It fetches _all_ the target's dynamic data; issuing it on hover for every link (recents that point at whole chats) is wasteful. Scope `kind: 'full'` to the runtime-prefetch targets only.
- **Marker must be a committed node, not RSC bytes.** The content is often a client component, so its text isn't in the prefetch response. Assert a `data-testid` that renders when the client subtree commits, not a substring of the stream.

Prefer a static shell whenever the read can move: it's cheaper than a runtime prefetch and also covers the initial load.
