---
title: Optimizing prefetching
description: Resolve per-link URL data, include session data in the App Shell, or defer expensive work to a later navigation stage.
nav_title: Optimizing prefetching
related:
  title: Learn more
  description: Learn more about the APIs and concepts used in this guide.
  links:
    - app/guides/keeping-pages-static
    - app/api-reference/config/next-config-js/partialPrefetching
    - app/api-reference/functions/prefetch
    - app/api-reference/functions/navigation
---

Prefetching downloads a route's JavaScript, CSS, and RSC payload before the user navigates to it, so the router can render the next route without waiting for a round trip. The [Prefetching guide](/docs/app/guides/prefetching) covers what the App Router prefetches by default.

With [Cache Components](/docs/app/getting-started/caching) and [Partial Prefetching](/docs/app/api-reference/config/next-config-js/partialPrefetching), Next.js loads server-rendered output in stages, before and during a client navigation. These are the route's [navigation stages](/docs/app/glossary#navigation-stages):

1. A default [`<Link>`](/docs/app/api-reference/components/link) loads the route's [**App Shell**](/docs/app/glossary#app-shell). It holds the route's static output and, for routes that read [`cookies()`](/docs/app/api-reference/functions/cookies) or [`headers()`](/docs/app/api-reference/functions/headers), its session-specific UI. Links to the same route share it.
2. A [`<Link prefetch={true}>`](/docs/app/api-reference/components/link#prefetch) also loads static or cached content that depends on the link's [URL data](/docs/app/glossary#url-data), such as [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional) and [`params`](/docs/app/api-reference/file-conventions/page#params-optional), which the shared shell cannot include.
3. When the user follows the link, the navigation renders the rest of the route.

Use [`prefetch()`](/docs/app/api-reference/functions/prefetch) and [`navigation()`](/docs/app/api-reference/functions/navigation) to move expensive work to a later stage. To require that a stage stays static across a route, see [Keeping pages static](/docs/app/guides/keeping-pages-static).

## Use the optimizer skill (recommended)

The [`next-partial-prefetching-optimizer`](/docs/app/guides/ai-agents#next-partial-prefetching-optimizer) skill applies this guide with a coding agent. It defines the UI that should be ready for a selected link in an [`instant()` test](/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests), proves the current behavior, and works the test to green.

Install the skill:

```bash filename="Terminal"
npx skills add vercel/next.js --skill next-partial-prefetching-optimizer
```

Then give the agent the source, destination, and UI that should be available immediately:

```prompt
Make the search results instant when navigating from / to /search?q=react. Use the next-partial-prefetching-optimizer Skill.
```

Enable [Cache Components](/docs/app/getting-started/caching) and [`partialPrefetching`](/docs/app/api-reference/config/next-config-js/partialPrefetching) before applying these optimizations:

```ts filename="next.config.ts" highlight={4,5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
}

export default nextConfig
```

If the route is not yet structured for instant navigation, start with the [Instant navigation guide](/docs/app/guides/instant-navigation) to validate its caching structure.

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

`'auto'` is equivalent to omitting `prefetch` or passing `undefined`. In a conditional expression, return `'auto'` for links that should keep the default App Shell prefetch:

```tsx filename="app/page.tsx"
<Link href={href} prefetch={isFeatured ? true : 'auto'} />
```

Use `prefetch={false}` only when you want to disable prefetching for a link.

The `/search` page renders a static heading and a `<Results>` list based on the query. The `search()` function caches results by query so later requests can reuse them.

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

With `prefetch={true}` on the link, the router requests a per-link prefetch that resolves `<Results>` before the click. The `q` value comes from the link's URL, which is known at prefetch time, and the cached `search(q)` call provides the result. When the user clicks, the results render immediately without showing the fallback.

Next.js includes static and cached content in the prefetch until it reaches an uncached read. It then includes the fallback from the surrounding `<Suspense>` boundary. That boundary is already in place from [structuring the route for instant navigation](/docs/app/guides/instant-navigation).

Generating the per-link prefetch costs **a server invocation per prefetchable link**, so it is opt-in per link. On pages where all the content is statically renderable, Next.js serves the prefetch from the static cache instead. A page that accesses non-static data is generated per prefetch, unless that access is [deferred to the navigation](#keep-the-prefetch-static).

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

The App Shell render can read session data. However, `"use cache"` cannot call `cookies()` inside the cached function, so use one of these patterns:

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

Here `cookies()` lives inside the cached function, which only works under `"use cache: private"`. Use the same pattern when runtime data cannot be extracted at the call site. For example, an authentication helper may compare `Date.now()` with a token's expiration, or a session helper may read cookies within its own code.

Everything inside the scope shares the same lifetime. Colocate `"use cache: private"` as close to the runtime data access as possible.

## Defer work to a later stage

The App Shell is shared by the links into a route. A per-link prefetch runs for a visible `<Link prefetch={true}>`, and the navigation runs when the user clicks. Expensive work may not be worth generating for links the user never follows.

Uncached work is already left out of prefetches. For cacheable work, `next/cache` exports functions that defer the code below each call:

- [`prefetch()`](/docs/app/api-reference/functions/prefetch) defers the code until a per-link prefetch or navigation.
- [`navigation()`](/docs/app/api-reference/functions/navigation) defers the code until navigation.

In the following diagram, a gray dashed outline marks the Suspense fallback, while blue marks the deferred work once it renders:

<Image
  alt="The Shell, Prefetch, and Navigation stages, with bars showing that work below prefetch() renders from the per-link prefetch onward and work below navigation() renders only during navigation, while earlier stages show the Suspense fallback"
  srcLight="/docs/light/navigation-stage-visual.png"
  srcDark="/docs/dark/navigation-stage-visual.png"
  width="1200"
  height="480"
/>

Both functions apply only during runtime rendering, so they do not change a fully static route. Each call defers the component that awaits it and that component's descendants. Earlier stages render the nearest [`<Suspense>`](https://react.dev/reference/react/Suspense) fallback, which the deferred subtree replaces when its stage runs. Unlike [`connection()`](/docs/app/api-reference/functions/connection), neither function makes the subtree request-dependent, so functions within it can still use `use cache`. See [How `navigation()` differs from `connection()`](/docs/app/api-reference/functions/navigation#how-navigation-differs-from-connection).

### Keep expensive session data out of the App Shell

Take the dashboard again. A ranking keyed on the session is expensive, and every default `<Link>` into the dashboard would generate it for the shell. Await `prefetch()` above the ranking so that only a `<Link prefetch={true}>` resolves it before the click:

```tsx filename="app/dashboard/recommendations.tsx" highlight={6}
import { cookies } from 'next/headers'
import { prefetch } from 'next/cache'

async function Recommendations() {
  const session = (await cookies()).get('session')?.value
  await prefetch()
  const items = await rank(session)
  return <List items={items} />
}

async function rank(session?: string) {
  'use cache: private'
  return db.recommendations.rank({ session })
}
```

The session is read above `prefetch()`, so it still resolves in the shell. The App Shell does not generate the ranking. A default `<Link>` includes the `<Suspense>` fallback, which the ranking replaces during navigation. A `<Link prefetch={true}>` resolves the ranking before the click. `rank` keeps its cache lifetime in both cases.

Neither function can be awaited inside a cached scope, so the directive goes on a function called below it, as `rank` does here.

### Wait for the navigation

Consider an inbox where each visible thread uses `<Link prefetch={true}>`. The prefetch should include the thread subject, but fetching every message body before the user opens it would waste work.

Render the latest message in its own `<Suspense>` boundary and await `navigation()` before loading it:

```tsx filename="app/inbox/[threadId]/thread.tsx" highlight={19}
import { Suspense } from 'react'
import { navigation } from 'next/cache'
import { getLatestMessage, getThreadSummary } from '@/lib/mail'

export async function Thread({ threadId }: { threadId: string }) {
  const thread = await getThreadSummary(threadId)

  return (
    <article>
      <h1>{thread.subject}</h1>
      <Suspense fallback={<p>Loading message...</p>}>
        <LatestMessage threadId={threadId} />
      </Suspense>
    </article>
  )
}

async function LatestMessage({ threadId }: { threadId: string }) {
  await navigation()
  const message = await getLatestMessage(threadId)
  return <p>{message.body}</p>
}
```

Both queries remain cached:

```ts filename="lib/mail.ts"
import { db } from '@/lib/db'

export async function getThreadSummary(threadId: string) {
  'use cache'
  return db.thread.findUniqueOrThrow({
    select: { subject: true },
    where: { id: threadId },
  })
}

export async function getLatestMessage(threadId: string) {
  'use cache'
  return db.message.findFirstOrThrow({
    orderBy: { sentAt: 'desc' },
    select: { body: true },
    where: { threadId },
  })
}
```

The per-link prefetch includes the cached subject and the message fallback. The cached message body loads when the user opens the thread, then remains available for later visits.

{/* TODO: once `<Link prefetch="navigation">` ships, document it here as the opt-in for a link that also prefetches cacheable work deferred with `navigation()`. */}

Leaving the subtree uncached would also keep it out of prefetches, but it would lose its cache lifetime on navigation too. For `use cache` content, a [`stale`](/docs/app/api-reference/functions/cacheLife#stale) time of five minutes or more lets the client-side router reuse it after the first navigation. Below that, each navigation fetches it again.

### Keep the prefetch static

When every read of `cookies()`, `headers()`, `params`, and `searchParams` sits below `navigation()`, a runtime prefetch would produce the same output as the build. Next.js can therefore serve the prefetch from static output. A CDN can cache that output, so a link into the route requires no server compute.

The dashboard cannot take this shape, because `<UserNav>` reads the team cookie in the shell. A feed with a static header can:

```tsx filename="app/feed/page.tsx" highlight={17}
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { navigation } from 'next/cache'

export default function Page() {
  return (
    <>
      <FeedHeader /> {/* static, and so is the whole prefetch */}
      <Suspense fallback={<p>Loading stories...</p>}>
        <Stories />
      </Suspense>
    </>
  )
}

async function Stories() {
  await navigation()
  const topic = (await cookies()).get('topic')?.value ?? 'all'
  return <StoryList items={await getStories(topic)} />
}
```

Reading the cookie below `navigation()` does not make the per-link prefetch render per request, because that read would not have resolved during the prefetch anyway. The same holds for `prefetch()` and the App Shell. When every `cookies()` and `headers()` read sits below `prefetch()`, the shell is served from static output. Reading `params` or `searchParams` does not require a runtime shell. URL data is excluded from the shared shell, but it can make a per-link prefetch render at runtime unless it sits below `navigation()`.

Each call defers one subtree. To require static output for the whole route, so a later change cannot reintroduce request-time rendering, set [`ensureStatic`](/docs/app/api-reference/file-conventions/route-segment-config/ensureStatic). The [Keeping pages static](/docs/app/guides/keeping-pages-static) guide walks through each level.

## Test prefetched and deferred content

The [Instant navigation guide](/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) explains how to install and configure `@next/playwright`. For a client navigation, use `instant()` to inspect the destination's prefetched UI.

When [adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching#verify-prefetched-ui-with-tests), run this test before enabling the feature and rerun the same assertions afterward. This preserves the UI selected from the legacy full prefetch while its implementation moves to the App Shell or a per-link prefetch.

Inside the callback, click the link, wait for the destination URL, and assert which content is available. After the callback releases the navigation, assert that deferred content eventually renders:

```ts filename="e2e/product-navigation.test.ts" highlight={8-15,17}
import { expect, test } from '@playwright/test'
import { instant } from '@next/playwright'

test('prefetches the product summary but not reviews', async ({ page }) => {
  await page.goto('/products')

  await instant(page, async () => {
    await page.click('a[href="/products/baseball-cap"]')
    await page.waitForURL((url) => url.pathname === '/products/baseball-cap')

    await expect(
      page.getByRole('heading', { name: 'Baseball Cap' })
    ).toBeVisible()
    await expect(page.getByTestId('product-summary')).toBeVisible()
    await expect(page.getByTestId('reviews')).toHaveCount(0)
  })

  await expect(page.getByTestId('reviews')).toBeVisible()
})
```

While the `instant()` callback is running, dynamic content is paused. In this example, the product summary is part of the prefetched UI, while reviews wait for navigation. The final assertion confirms that the reviews render after the pause is released.

In development, a `prefetch()` or `navigation()` call outside `<Suspense>` surfaces an [Instant Insight](/docs/messages/instant-navigation-stage). A fully prerendered route is unaffected, but the insight identifies that the call would defer content without a fallback if the route later requires runtime rendering. Calls in [`generateMetadata()`](/docs/messages/instant-navigation-stage-metadata) and [`generateViewport()`](/docs/messages/instant-navigation-stage-viewport) have separate insights.

## Trade-offs

Use `prefetch={true}` on routes where:

- Part of the component tree depends on URL data: the full URL, `searchParams`, or `params` not resolved by [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)
- That part of the tree has a known cache lifetime (it can be expressed with `"use cache"` or `"use cache: private"`)
- The traffic justifies the per-link server invocation

Prefetching cached data does not change its freshness behavior. If a mutation can update the data, [tag and invalidate the cached result](/docs/app/getting-started/revalidating).

Skip it when the prefetch can't produce a better UI than the App Shell. Each visible `<Link prefetch={true}>` can wake a server, and that cost only pays off if more of the page is ready before the click:

- The route has little or no URL-data dependency. The App Shell already makes the navigation instant.
- The dependent content has to be fresh on every request. The prerender stops at the same `<Suspense>` fallback, so the user sees the same UI either way.
- The route is rarely navigated to. You pay per visible link, regardless of click-through.

A per-link prefetch is best-effort. It only helps the navigations where it completes before the click. On a slow connection, on a feed of many links, or on a direct visit, it may not be ready when the user navigates, and the navigation falls back to the App Shell.

When many links to a route are visible at once, such as a grid of cards, each `<Link prefetch={true}>` prefetches that link's content as it enters the viewport, so the grid makes one such server request per card. Prefetch on intent instead. A [hover-triggered prefetch](/docs/app/guides/prefetching#hover-triggered-prefetch) fetches only the links the user is likely to click. The default `<Link>` (without `prefetch={true}`) loads only the App Shell, so it doesn't carry this cost.

|         | App Shell                                                                                 | Per-link prefetch with `prefetch={true}`                                                          | Navigation                                           |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Scope   | One per route                                                                             | One per visible `<Link prefetch={true}>`                                                          | One per click                                        |
| Content | Route's rendered output minus per-link data and work below `prefetch()` or `navigation()` | App Shell plus per-link URL data and work below `prefetch()`, excluding work below `navigation()` | Everything left, including work below `navigation()` |
| Cost    | Bounded by route count                                                                    | Bounded by visible-link count                                                                     | Bounded by navigations                               |
| Role    | Default prefetch                                                                          | More rendered before click                                                                        | Completes the route                                  |

[Deferring work](#defer-work-to-a-later-stage) avoids generating content for prefetches that may never be used. The tradeoff is that a navigation may show the nearest `<Suspense>` fallback while the deferred content renders.

## Next steps

- [Adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) for how `<Link>` behaves under the new model and how to migrate existing apps.
- [`prefetch()`](/docs/app/api-reference/functions/prefetch) and [`navigation()`](/docs/app/api-reference/functions/navigation) for the full behavior of each navigation stage API.
- [Keeping pages static](/docs/app/guides/keeping-pages-static) for requiring a static App Shell, prefetch, or complete route with `ensureStatic`.
- [Instant navigation guide](/docs/app/guides/instant-navigation) for validating the route's caching structure.
