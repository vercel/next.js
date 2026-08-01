# Optimization decisions

Use this after an Instant Insight identifies the blocker. Keep the optimizer's
selection and boundary decisions here; use the linked fix for framework code.

See: [Instant navigations](https://nextjs.org/docs/app/guides/instant-navigation)
and [maximizing the static shell](https://nextjs.org/docs/app/getting-started/caching#maximizing-the-static-shell).

Production shapes that need extra optimizer judgment, including parallel routes,
responsive shells, and authorization gates, are in `real-app-patterns.md`.

## 1. Request and URL data

For `cookies()`, `headers()`, `params`, and `searchParams`, move the read into a
Suspense-wrapped leaf and keep static siblings in the App Shell.

See: [Runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime).

Optimizer decision:

- Keep request-dependent work behind the smallest meaningful boundary.
- Keep static siblings above that boundary so they join the App Shell.
- Prefer the route's existing loading UI over a newly duplicated page skeleton.
- If the whole useful route depends on request data and no safe, meaningful shell
  remains, accept a blocking segment using the insight's opt-out instead of
  manufacturing an empty shell.

Useful API references:

- [`loading.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- [`generateStaticParams`](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)
- [`useSearchParams`](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
- [URL data in a Client Component](https://nextjs.org/docs/messages/blocking-prerender-client-hook)

## 2. Uncached data

For uncached `fetch()` calls, database reads, and `connection()`, cache data
with an acceptable lifetime or stream genuinely fresh data behind Suspense.

See: [Uncached data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-dynamic).

Use the cache APIs only after the user or application requirements establish a
freshness policy:

- [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [`cacheLife`](https://nextjs.org/docs/app/api-reference/functions/cacheLife)
- [`use cache: remote`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)
- [`connection`](https://nextjs.org/docs/app/api-reference/functions/connection)

If freshness is unknown during an unattended run, stream the read. Do not invent
a cache lifetime.

## 3. Non-deterministic values

Use the insight that matches the API. Each page explains the choice between a
per-request value and a cached value:

- [`Date.now()`](https://nextjs.org/docs/messages/blocking-prerender-current-time)
- [`Math.random()`](https://nextjs.org/docs/messages/blocking-prerender-random)
- [Web Crypto and Node.js crypto](https://nextjs.org/docs/messages/blocking-prerender-crypto)

## 4. Metadata and viewport

Use the matching insight:

- [Runtime data in `generateMetadata()`](https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime)
- [Uncached data in `generateMetadata()`](https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic)
- [Runtime data in `generateViewport()`](https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime)
- [Uncached data in `generateViewport()`](https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic)

Do not count `instant = false` or an empty document shell as a GREEN optimization.

## 5. Keep meaningful content in the shell

Passing validation proves that a shell can commit. It does not prove that the
shell is useful:

- Keep the primary heading and other stable, meaningful content outside broad
  boundaries when their data can safely join the shell.
- Push boundaries toward the data they guard.
- Reuse loading UI that approximates the final layout.
- Verify the same shell at the route's supported breakpoints.

See: [Iterate on loading states](https://nextjs.org/docs/app/guides/instant-navigation#iterate-on-loading-states).

## 6. Test the exact navigation

Boundary coverage differs between an initial document load and a client
navigation below a shared layout. Drive the exact navigation being optimized.

See: [What instant means](https://nextjs.org/docs/app/guides/instant-navigation#what-instant-means).

Use `test-template.md` for the deterministic `instant()` verdict. A
client-navigation test must click the real link; a direct `page.goto()`
measures the initial document path instead.

## 7. URL-specific content: stop and hand off

The App Shell is shared across links to a route. If the useful missing region is
specific to one link's `params`, `searchParams`, or URL, finish and preserve the
best meaningful static shell here.

After Partial Prefetching adoption, hand that exact link to the experimental
[`next-partial-prefetching-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-optimizer).
Do not add per-link prefetching from this optimizer.
