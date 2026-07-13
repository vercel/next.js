---
title: Runtime prefetching
description: Prefetch URL data alongside the App Shell using the prefetch segment config and per-session caching directives.
nav_title: Runtime prefetching
version: experimental
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

Prefetching downloads a route's JavaScript, CSS, and RSC payload before the user navigates to it, so the router can render the next route without waiting for a round trip.

The regular App Router prefetches a route all or nothing: the full route when it's static, and nothing for a dynamic route without a [`loading.js`](/docs/app/api-reference/file-conventions/loading).

[Cache Components](/docs/app/getting-started/caching) takes a different approach and produces an [**App Shell**](/docs/app/glossary#app-shell) for every route. The shell contains the route's static output, and for a route that reads [`cookies()`](/docs/app/api-reference/functions/cookies) or [`headers()`](/docs/app/api-reference/functions/headers) (session data), it can also contain UI gated behind that session data.

Prefetching one reusable shell per route, rather than a separate prefetch per link, is [**Partial Prefetching**](/docs/app/api-reference/config/next-config-js/partialPrefetching). Any number of links to the same route share that one shell, fetched once as a [`<Link>`](/docs/app/api-reference/components/link) enters the viewport and reused for the rest.

The shell cannot carry data that varies per link: [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional) and [`params`](/docs/app/api-reference/file-conventions/page#params-optional), the route's [URL data](/docs/app/glossary#url-data). **Runtime prefetching** resolves that URL data at prefetch time, ready before the click rather than streaming in after it.

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

## What runtime prefetching does

Runtime prefetching takes two opt-ins: links to the route use `<Link prefetch={true}>`, and the destination route sets [`prefetch = 'allow-runtime'`](/docs/app/api-reference/file-conventions/route-segment-config/prefetch#allow-runtime).

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

export const prefetch = 'allow-runtime'

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

Without `prefetch = 'allow-runtime'`, the App Shell renders `<h1>` and shows the `<Results>` fallback. The query resolves after the click and streams the results in.

With [`prefetch = 'allow-runtime'`](/docs/app/api-reference/file-conventions/route-segment-config/prefetch) on the route, the router prefetches a prerender that resolves `<Results>` before the click. The `q` value comes from the link's URL, known at prefetch time, and the cached `search(q)` fills in from there. On the click, the results render immediately, with no fallback.

The prerender advances through anything static or cached, then stops at uncached reads and falls back to the surrounding `<Suspense>` boundary. That boundary is already in place from [structuring the route for instant navigation](/docs/app/guides/instant-navigation).

More of the page is rendered before the user clicks, with fewer loading states.

Generating it costs **a server invocation per prefetchable link**, so it is opt-in per route.

> **Good to know:** A cold cache (first visit, or after expiration) means the server still has to compute the cached result. Users may see a loading spinner on that first navigation. Subsequent navigations are instant as long as the cache is warm.

Like `searchParams`, `params` needs a `<Suspense>` boundary, even when the values are predefined by [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params). A statically known param still belongs to one URL. Runtime prefetching resolves the values `generateStaticParams` does not cover.

## Session data resolves in the shell

Runtime prefetching, via `allow-runtime`, is for URL data. Session data is handled separately: a route that reads `cookies()` or `headers()`, including through `"use cache: private"`, gets an App Shell that includes its session data, cached per session on the client and ready on navigation without `allow-runtime`.

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

## Per-link prefetching trade-offs

Use it on routes where:

- Part of the component tree depends on URL data: the full URL, `searchParams`, or `params` not resolved by [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)
- That part of the tree has a known cache lifetime (it can be expressed with `"use cache"` or `"use cache: private"`)
- The traffic justifies the per-link server invocation

Skip it when the prefetch can't produce a better UI than the App Shell. Each visible `<Link>` to a route with `'allow-runtime'` wakes a server, and that cost only pays off if more of the page is ready before the click:

- The route has little or no URL-data dependency. The App Shell already makes the navigation instant.
- The dependent content has to be fresh on every request. The prerender stops at the same `<Suspense>` fallback, so the user sees the same UI either way.
- The route is rarely navigated to. You pay per visible link, regardless of click-through.

A per-link runtime prefetch is best-effort. It only helps the navigations where it completes before the click. On a slow connection, on a feed of many links, or on a direct visit, it may not be ready when the user navigates, and the navigation falls back to the App Shell. That shell is the reliable baseline, and runtime prefetching only layers on top when it arrives in time.

|         | App Shell                                   | Per-link runtime prefetch with `allow-runtime` |
| ------- | ------------------------------------------- | ---------------------------------------------- |
| Scope   | One per route                               | One per visible `<Link prefetch={true}>`       |
| Content | Route's rendered output minus per-link data | Same, plus per-link URL data resolved          |
| Cost    | Bounded by route count                      | Bounded by visible-link count                  |
| Role    | Every route's instant floor                 | Upgrade: more rendered before click            |

## Next steps

- [Adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) for how `<Link>` behaves under the new model and how to migrate existing apps.
- [`prefetch` API reference](/docs/app/api-reference/file-conventions/route-segment-config/prefetch) for all prefetch modes.
- [`use cache: private` reference](/docs/app/api-reference/directives/use-cache-private) for per-user caching specifics.
- [Instant navigation guide](/docs/app/guides/instant-navigation) for validating the route's caching structure.
- [Caching](/docs/app/getting-started/caching) for background on `use cache`, Suspense, and Partial Prerendering.
