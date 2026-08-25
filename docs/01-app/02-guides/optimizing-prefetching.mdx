---
title: Optimizing prefetching
description: Resolve per-link URL data with the prefetch prop, or include session data in the App Shell.
nav_title: Optimizing prefetching
related:
  title: Learn more
  description: Validate your structure and review the caching primitives.
  links:
    - app/api-reference/config/next-config-js/partialPrefetching
    - app/api-reference/file-conventions/route-segment-config/prefetch
    - app/api-reference/file-conventions/route-segment-config/instant
    - app/api-reference/directives/use-cache-private
    - app/getting-started/caching
    - app/guides/instant-navigation
    - app/guides/prefetching
---

Prefetching downloads a route's JavaScript, CSS, and RSC payload before the user navigates to it, so the router can render the next route without waiting for a round trip. The [Prefetching guide](/docs/app/guides/prefetching) covers what the App Router prefetches by default.

With [Cache Components](/docs/app/getting-started/caching) and [Partial Prefetching](/docs/app/api-reference/config/next-config-js/partialPrefetching), a [`<Link>`](/docs/app/api-reference/components/link) prefetches one reusable [**App Shell**](/docs/app/glossary#app-shell) per route by default. The App Shell includes the route's static output. For routes that read [`cookies()`](/docs/app/api-reference/functions/cookies) or [`headers()`](/docs/app/api-reference/functions/headers), it also includes session-specific UI. Links to the same route reuse that App Shell.

The shared App Shell does not include URL data that varies by destination, such as [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional) and [`params`](/docs/app/api-reference/file-conventions/page#params-optional). Set `prefetch={true}` on a link to resolve cached content that depends on its [URL data](/docs/app/glossary#url-data) before navigation instead of streaming that content after navigation.

This guide assumes [Cache Components](/docs/app/getting-started/caching) with [`partialPrefetching`](/docs/app/api-reference/config/next-config-js/partialPrefetching) enabled:

```ts filename="next.config.ts" highlight={4,5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
}

export default nextConfig
```

It also assumes your route is already structured for instant navigation. If it isn't, start with the [Instant navigation guide](/docs/app/guides/instant-navigation) to validate its caching structure first.

## Resolve URL data at prefetch time

Set `<Link prefetch={true}>` to resolve URL data for that link before navigation. The destination must use [Partial Prefetching](/docs/app/api-reference/config/next-config-js/partialPrefetching), enabled globally with `partialPrefetching` or per segment with [`prefetch = 'partial'`](/docs/app/api-reference/file-conventions/route-segment-config/prefetch#partial).

A user on `/` sees links to `/search?q=react` and `/search?q=next`, each opting in with `prefetch={true}`:

```tsx filename="app/page.tsx"
import Link from 'next/link'

export default function Home() {
  return (
    <nav>
      <Link href="/search?q=react" prefetch={true}>
        React
      </Link>
      <Link href="/search?q=next" prefetch={true}>
        Next.js
      </Link>
    </nav>
  )
}
```

The destination renders a static heading and a `<Results>` list whose contents depend on the query. Each query is cached, computed once and reused.

```tsx filename="app/search/page.tsx"
import { Suspense } from 'react'

export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <>
      <h1>Search</h1>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({
  searchParams,
}: {
  searchParams: PageProps<'/search'>['searchParams']
}) {
  const { q } = await searchParams
  return <ResultList items={await search(q)} />
}

async function search(q: string) {
  'use cache'
  return db.search(q)
}
```

Without `prefetch={true}`, the App Shell renders `<h1>` and shows the `<Results>` fallback. The query resolves after the click and streams the results in.

With `prefetch={true}` on the link, the router prefetches a prerender that resolves `<Results>` before the click. The `q` value comes from the link's URL, known at prefetch time, and the cached `search(q)` provides the result. On the click, the results render immediately, with no fallback.

The prerender advances through anything static or cached, then stops at uncached reads and falls back to the surrounding `<Suspense>` boundary. That boundary is already in place from [structuring the route for instant navigation](/docs/app/guides/instant-navigation).

Generating the per-link prefetch costs **a server invocation per prefetchable link**, so it is opt-in per link. On pages where all the content is statically renderable, Next.js serves the prefetch from the static cache instead. A page that accesses non-static data is generated per prefetch.

> **Good to know:** A cold cache (first visit, or after expiration) means the server still has to compute the cached result. Users may see a loading spinner on that first navigation. Subsequent navigations are instant as long as the cache is warm.

Like `searchParams`, `params` needs a `<Suspense>` boundary, even when the values are predefined by [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params). A statically known param still belongs to one URL. A per-link prefetch with `prefetch={true}` resolves the values `generateStaticParams` does not cover.

## Include session data in the shell

`prefetch={true}` resolves URL data. Session data is handled separately. A route that reads `cookies()` or `headers()`, including through `"use cache: private"`, gets an App Shell that includes its session data, cached per session on the client and ready on navigation without a per-link prefetch.

A lookup based on session data needs a cache lifetime, the same way `search(q)` did for the URL. Take a dashboard nav that reads a cookie, then looks up content based on it:

```tsx filename="app/dashboard/layout.tsx"
import { Suspense } from 'react'

export default function DashboardLayout({
  children,
}: LayoutProps<'/dashboard'>) {
  return (
    <div>
      <Suspense fallback={<nav>Loading...</nav>}>
        <UserNav />
      </Suspense>
      <main>{children}</main>
    </div>
  )
}
```

The cookie itself is session data the App Shell already knows. But `"use cache"` can't read `cookies()` inside the cached function, so two patterns bridge it:

- **Extract and pass** when the lookup result is shared across many sessions.
- **`"use cache: private"`** when it is tied to one.

### Extract and pass

Read the cookie outside the cached function and pass the value in as an argument. The `cookies()` call stays outside the cache scope, the argument crosses the boundary, and the cached function has a deterministic signature. The cache entry is keyed on that argument, and sessions that share the value share the entry.

```tsx filename="app/dashboard/user-nav.tsx"
import { cookies } from 'next/headers'

async function UserNav() {
  const team = (await cookies()).get('team')?.value
  const topics = await getTopics(team)
  return (
    <nav>
      {topics.map((topic) => (
        <a key={topic.id} href={topic.href}>
          {topic.label}
        </a>
      ))}
    </nav>
  )
}

async function getTopics(team: string | undefined) {
  'use cache'
  return db.topics.forTeam(team)
}
```

On a direct visit, `<UserNav>` shows its fallback until the lookup resolves. On navigation, the App Shell has already resolved it, because the team cookie is session data the shell can read. Because sessions on the same team share the cache entry, traffic to the underlying data scales with team count, not session count.

Anything without a caching directive still streams in after navigation. A shell holds only what can be prepared ahead of the navigation, not the whole page. It advances only as far as the caching structure allows.

### `"use cache: private"`

When the lookup is tied to a single session, use [`"use cache: private"`](/docs/app/api-reference/directives/use-cache-private). It assigns a cache lifetime to a function that reads cookies, headers, or other runtime data directly. Results are cached in the browser only, scoped to that session.

```tsx filename="app/dashboard/user-nav.tsx"
import { cookies } from 'next/headers'

async function UserNav() {
  const user = await getUser()
  return <nav>{user.name}</nav>
}

async function getUser() {
  'use cache: private'
  const session = (await cookies()).get('session')?.value
  return db.users.findBySession(session)
}
```

Here `cookies()` lives inside the cached function, which only works under `"use cache: private"`. This is also the pattern when you can't extract the runtime data from the outside: auth helpers that check `Date.now()` against a token's expiry, or session helpers that read cookies deep inside their own code, can't be wrapped at the call site.

Everything inside the scope shares the same lifetime. Colocate `"use cache: private"` as close to the runtime data access as possible.

{/* TODO(optimizing-prefetching): add an "Exclude content until navigation" section once `await navigation()` (ships as `unstable_navigation`, vercel/next.js#96069) merges. This is the second direction, gating content OUT of the prefetch rather than resolving URL data into it: the prefetch stops at `await navigation()` (code after it does not run at prefetch time), and on the actual navigation (or build/ISR) it runs and streams in. Unlike `await connection()`, content below the gate stays cacheable. It can't be called inside `use cache` / `use cache: private` yet, so the pattern is `await navigation()` in an uncached wrapper with the cache directive on an inner function below the gate. Do NOT publish until merged; validate empirically against the PR branch first. */}

## Trade-offs

Use `prefetch={true}` on routes where:

- Part of the component tree depends on URL data: the full URL, `searchParams`, or `params` not resolved by [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)
- That part of the tree has a known cache lifetime (it can be expressed with `"use cache"` or `"use cache: private"`)
- The traffic justifies the per-link server invocation

Skip it when the prefetch can't produce a better UI than the App Shell. Each visible `<Link prefetch={true}>` can wake a server, and that cost only pays off if more of the page is ready before the click:

- The route has little or no URL-data dependency. The App Shell already makes the navigation instant.
- The dependent content has to be fresh on every request. The prerender stops at the same `<Suspense>` fallback, so the user sees the same UI either way.
- The route is rarely navigated to. You pay per visible link, regardless of click-through.

A per-link prefetch is best-effort. It only helps the navigations where it completes before the click. On a slow connection, on a feed of many links, or on a direct visit, it may not be ready when the user navigates, and the navigation falls back to the App Shell.

When many links to a route are visible at once, such as a grid of cards, each `<Link prefetch={true}>` prefetches that link's content as it enters the viewport, so the grid makes one such server request per card. Prefetch on intent instead. A [hover-triggered prefetch](/docs/app/guides/prefetching#hover-triggered-prefetch) fetches only the links the user is likely to click. The default `<Link>` (without `prefetch={true}`) prefetches only the App Shell, so it doesn't carry this cost.

|         | App Shell                                   | Per-link prefetch with `prefetch={true}` |
| ------- | ------------------------------------------- | ---------------------------------------- |
| Scope   | One per route                               | One per visible `<Link prefetch={true}>` |
| Content | Route's rendered output minus per-link data | Same, plus per-link URL data resolved    |
| Cost    | Bounded by route count                      | Bounded by visible-link count            |
| Role    | Default prefetch                            | More rendered before click               |

## Next steps

- [Adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) for how `<Link>` behaves under the new model and how to migrate existing apps.
- [`prefetch` API reference](/docs/app/api-reference/file-conventions/route-segment-config/prefetch) for all prefetch modes.
- [`use cache: private` reference](/docs/app/api-reference/directives/use-cache-private) for per-user caching specifics.
- [Instant navigation guide](/docs/app/guides/instant-navigation) for validating the route's caching structure.
- [Caching](/docs/app/getting-started/caching) for background on `use cache`, Suspense, and Partial Prerendering.
