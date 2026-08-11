---
title: Ensuring instant navigations
description: Learn how to structure your app to prefetch and prerender more content, providing instant page loads and client navigations.
nav_title: Instant navigation
related:
  title: Learn more
  description: Explore the full instant API, caching, and revalidation.
  links:
    - app/api-reference/file-conventions/route-segment-config/instant
    - app/guides/optimizing-prefetching
    - app/getting-started/caching
    - app/getting-started/revalidating
    - app/guides/prefetching
---

This guide walks through understanding instant navigations, writing a route that navigates instantly, visualizing what's in the initial UI, and locking the behavior in with end-to-end tests.

## What "instant" means

A navigation is **instant** when the browser can start rendering the new page the moment the user clicks, with static, cached, and fallback content showing up right away, while the server streams the remaining content into its fallbacks.

> **Good to know:** This definition assumes caches are warm. Cold caches still require the server to compute the cached result once, so the first navigation to a route may still wait.

A direct visit and a client navigation to the same route can produce different initial UI. **Direct visits** get the [**static shell**](/docs/app/glossary#static-shell) as HTML, typically from a CDN. **Client navigations** only re-render below the layout the current and destination routes share, so the fallback UI defined by a `<Suspense>` boundary above that point can't be used during the transition.

Whether the new page appears instantly depends on the `<Suspense>` boundaries and caching present below the shared layout.

<details>
<summary>Why page loads and client navigations produce different initial UI</summary>

On a page load, the entire page renders from the document root. Every component runs on the server, and anything that suspends is caught by the nearest `<Suspense>` boundary in the full tree.

On a client navigation between `/store/shoes` and `/store/hats`, only the components below the `/store` layout re-render. A `<Suspense>` boundary in the root layout covers everything on a page load, but on this navigation, it sits above the re-render scope and does not trigger.

This is also why client-side hooks behave differently. `useSearchParams()` suspends during server rendering because search params are not available at build time. But on a client navigation, the router already has the params from the URL and the hook resolves synchronously. The same component can render immediately on a client navigation but sit behind a fallback on a page load.

</details>

With `prefetch={true}`, per-link prefetching resolves a link's URL data (`searchParams` and `params`) before navigation. First make the route instant with its App Shell. Per-link prefetching cannot fix a route that blocks without it. See [Optimizing prefetching](/docs/app/guides/optimizing-prefetching) for the patterns.

## Quick start

Getting the most out of Instant Navigation requires enabling [Cache Components](/docs/app/guides/migrating-to-cache-components) and [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching), then following the [validation errors](#validate-instant-navigation) that appear:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
}

export default nextConfig
```

To help you automate this process with an agent, there's a Skill for each part, [next-cache-components-adoption](https://www.skills.sh/vercel/next.js/next-cache-components-adoption) and [next-partial-prefetching-adoption](https://www.skills.sh/vercel/next.js/next-partial-prefetching-adoption). If you'd like to enable everything, give your agent this prompt:

```prompt
Adopt Cache Components and Partial Prefetching in this app so its navigations become instant. There is a Skill for each migration.

1. Before you change anything, explain to me in plain terms what Instant Navigation is and what adopting it will change.

2. Install the Skills you need, then verify your changes against a running dev server with next-dev-loop and agent-browser as you go:
   - next-cache-components-adoption: https://www.skills.sh/vercel/next.js/next-cache-components-adoption
   - next-partial-prefetching-adoption: https://www.skills.sh/vercel/next.js/next-partial-prefetching-adoption
   - next-dev-loop: https://www.skills.sh/vercel/next.js/next-dev-loop

3. Each Skill leaves decisions to me, like how much of the work lands in each pull request. Put those questions to me and wait for my answers instead of deciding on my behalf. Adopt Cache Components first, then Partial Prefetching, following the workflow each Skill lays out. Don't rush to a passing build.

4. When you finish a step, show me a table of the routes you touched and what changed on each, and talk me through what it means for the app. Keep it to the outcome, not the implementation details.
```

The rest of this guide covers the tools these migrations use, walks a navigation that blocks to instant, inspects what lands in the initial UI, and locks the result in with end-to-end tests.

## The tools

### Build the static shell

With Cache Components, **caching directives** (`"use cache"` and its variants) assign a lifetime to an async function's result, which is what lets Next.js include it in the static shell.

> **Good to know:** [`"use cache: private"`](/docs/app/api-reference/directives/use-cache-private) is a variant for caching functions that read runtime APIs like `cookies()` and `headers()`. The result is cached in the browser only, not on the server. **It can't be part of the static shell.** See [`"use cache: private"`](/docs/app/guides/optimizing-prefetching#use-cache-private) in the Optimizing prefetching guide for how it pairs with prefetching.

**`<Suspense>`** declares fallback UI for parts of the tree that read uncached data or runtime APIs like `cookies()` and `headers()`; the content streams into the fallback when it resolves.

> **Good to know:** A fallback may access `cookies()`, `headers()`, or the full URL. At build time, the fallback itself suspends, and a `<Suspense>` boundary further up the tree is needed. For a link with `prefetch={true}`, [per-link prefetching](/docs/app/guides/optimizing-prefetching) makes URL data available before navigation, so the fallback can become part of the prefetched UI. Cached values like timestamps or data fetches can sit directly inside the fallback.

Next.js can also generate an [**App Shell**](/docs/app/glossary#app-shell) per route, which renders during client navigations while remaining content streams. Partial Prefetching uses the App Shell as the default `<Link>` prefetch. A link with `prefetch={true}` can also resolve cached content that depends on that link's URL data.

### Prefetch URL data for a link

Under [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching), each visible `<Link>` prefetches the destination's App Shell by default. Links to the same route share one App Shell instead of triggering a separate App Shell request for each link.

To prefetch the page content alongside the shell for a specific link, set [`prefetch={true}`](/docs/app/api-reference/components/link#prefetch):

```tsx
<Link href="/checkout" prefetch>
  Checkout
</Link>
```

With Partial Prefetching enabled, `prefetch={true}` also opts the link into [per-link prefetching](/docs/app/guides/optimizing-prefetching), which resolves the per-link URL data (`params`, `searchParams`, the full URL) ahead of the click.

### Validate instant navigation

By **default** (`validationLevel: 'warning'`), Cache Components apps validate every Page and Default segment in development. Validation surfaces what would keep navigations into a segment from being instant — which navigations would block, where a `<Suspense>` boundary is missing, and which data is reaching the user uncached.

To opt out of automatic validation and only validate segments that explicitly export `instant`, set [`validationLevel`](/docs/app/api-reference/file-conventions/route-segment-config/instant#configuring-validation-defaults) to `'manual-warning'`:

```ts filename="next.config.ts" highlight={7}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

export default nextConfig
```

<details>
<summary>How validation simulates different navigations</summary>

For each validated route, Next.js checks both the initial page load and client navigations at different points in the route hierarchy.

For a route like `/shop/[slug]`, validation checks:

- **Page load**: the full tree renders from the root. The root layout `<Suspense>` catches everything.
- **Client navigation** (e.g. from `/shop/shoes` to `/shop/hats`): the `/shop` layout is already mounted and only the page below it re-renders. A `<Suspense>` boundary in the root layout does not cover this navigation.

Each case is validated independently. A `<Suspense>` boundary that covers one navigation path might not cover another. This is why a page can pass the page load check but fail for client navigations, and why catching these issues by hand is difficult as the number of routes grows.

</details>

### Test it in CI

The `@next/playwright` package provides an [`instant()`](/docs/app/api-reference/file-conventions/route-segment-config/instant#testing-instant-navigation) helper that scopes your assertions to the UI that's immediately available on navigation, so regressions surface in CI. See [Prevent regressions with e2e tests](#prevent-regressions-with-e2e-tests) for the pattern.

### Inspect loading states

The **Navigation Inspector** in the Next.js DevTools freezes the page at its initial loading state, showing the static shell on direct visits and the prefetched destination on client navigations. Use the inspector to see how much meaningful content lands in the shell.

Pair it with the React DevTools Suspense panel to see exactly which boundary covers which part of the page. See [Visualize loading states with the Next.js DevTools](#visualize-loading-states-with-the-nextjs-devtools) for the workflow.

See [Maximizing the static shell](/docs/app/getting-started/caching#maximizing-the-static-shell) for patterns to reduce fallback coverage and pull more content into the shell.

## A page that navigates instantly

To see the primitives in action, consider a small store app. Each product has its own page at `/store/[slug]`, reachable from the homepage and from other product pages. The goal is that navigating to and between products is instant.

The product page fetches two pieces of data: product details (name, price) and live inventory.

- There is no `generateStaticParams`, meaning `slug` is only known at request time
- Both components await `params` to get the `slug`, which suspends. Each has its own `<Suspense>` boundary
- **Product info** rarely changes and is queried from the db using a cached function
- **Inventory** must be fresh on each request. The db query is inside a `<Suspense>` boundary

```tsx filename="app/store/[slug]/page.tsx" highlight={7-12,31}
import { Suspense } from 'react'
import { db } from '@/lib/db'

export default function ProductPage(props: PageProps<'/store/[slug]'>) {
  return (
    <div>
      <Suspense fallback={<p>Loading product...</p>}>
        <ProductInfo params={props.params} />
      </Suspense>
      <Suspense fallback={<p>Checking availability...</p>}>
        <Inventory params={props.params} />
      </Suspense>
    </div>
  )
}

type Params = PageProps<'/store/[slug]'>['params']

async function ProductInfo({ params }: { params: Params }) {
  const { slug } = await params
  const product = await getProduct(slug)
  return (
    <>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </>
  )
}

async function getProduct(slug: string) {
  'use cache'
  return db.products.findBySlug(slug)
}

async function Inventory({ params }: { params: Params }) {
  const { slug } = await params
  const item = await db.inventory.findBySlug(slug)
  return <p>{item.count} in stock</p>
}
```

Cache Components validates this route automatically in development. If something would block a navigation, the dev overlay surfaces a **blocking-route** insight that names the offending component and points at these fixes:

<FixCardGrid>
  <FixCard
    group="cache"
    title="Cache the component or data"
    href="/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data"
    snippets={[
      { text: 'async function Posts() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return <List items={…} />' },
    ]}
  />
  <FixCard
    group="stream"
    title="Wrap in or move into Suspense"
    href="/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense"
    snippets={[
      { text: '<Suspense fallback={…}>', highlight: true },
      { text: '  <DataChild />' },
      { text: '</Suspense>', highlight: true },
    ]}
  />
</FixCardGrid>

> **Good to know:** Each fix card links to a detailed walkthrough with patterns, code samples, and trade-offs. Click a card to dive in, or use **Copy prompt** to hand the fix to your agent. See [AI workflow](#ai-workflow) for the loop.

Validation runs on every page load using the real request from your browser, so dynamic params like `[slug]` are checked against actual values as you navigate.

### Client Component Pages

A soft navigation into a page with `"use client"` at the top behaves like a single-page app transition, with no server render at navigation time, which makes it instant. The dev overlay doesn't include this in its fix cards because it has bigger implications than the recommended approaches, which keep the page in the server-component model. Reach for `"use client"` when the page is fully interactive and must be a client component.

> **Good to know**: `"use client"` doesn't skip validation for the static shell. Hooks like `useSearchParams()` still need a `<Suspense>` boundary.

## Visualize loading states with the Next.js DevTools

As you develop a route, the Next.js DevTools let you see what your users see on page loads and client navigations before dynamic data streams in. Use it to verify that your loading states look right, confirm the content you expect appears immediately, and iterate on where to place `<Suspense>` boundaries.

The [React DevTools Suspense panel](https://react.dev/learn/react-developer-tools) complements this: it lists the `<Suspense>` boundaries in the tree and lets you toggle each one between its fallback and resolved state, so you can see exactly which boundary covers which part of the page.

{/* TODO: screenshot — React DevTools Suspense panel listing boundaries with toggle controls */}

The Navigation Inspector is available when Cache Components is enabled:

```ts filename="next.config.ts" highlight={4}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

Open the Next.js DevTools and select **Navigation Inspector**, then toggle **Pause on navigations**. The panel shows **Awaiting navigation...** With the toggle on, the next refresh or link click freezes the page so you can inspect the shell.

Refresh the product page. The Inspector freezes and shows **Loading shell** labeled **Page load** with the target URL. In the app, two fallbacks appear: "Loading product..." and "Checking availability...". On the first visit the cache is cold and both are visible.

<div
  style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  }}
>
  <Image
    alt="Navigation Inspector panel showing 'Loading shell' labeled 'Page load' with the target URL"
    srcLight="/docs/light/inspector-load.png"
    srcDark="/docs/dark/inspector-load.png"
    width="472"
    height="389"
  />
  <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>
    After a page refresh.
  </span>
</div>

Click **Resume** to complete the navigation. Refresh again, and the product name appears immediately from cache.

Now click a link from `/store/shoes` to `/store/hats`. The Inspector shows **Loading shell** labeled **Client nav** with both source and target URLs. In the app, the product name and price appear immediately (cached). "Checking availability..." shows where inventory will stream in.

<div
  style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  }}
>
  <Image
    alt="Navigation Inspector panel showing 'Loading shell' labeled 'Client nav' with source and target URLs"
    srcLight="/docs/light/inspector-client.png"
    srcDark="/docs/dark/inspector-client.png"
    width="481"
    height="395"
  />
  <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>
    After a client navigation.
  </span>
</div>

Toggle **Pause on navigations** off when you're done inspecting loading states. Each navigation pauses as long as the toggle is on.

> **Good to know:** Page loads and client navigations can produce different shells. Client-side hooks like `useSearchParams` suspend on page loads (search params are not known at build time) but resolve synchronously on client navigations (the router already has the params).

## Prevent regressions with e2e tests

Validation catches structural problems during development, but as the codebase grows, the structural checks can only tell you that a shell exists. They can't tell you whether the right content is in it. E2E tests close that gap: they assert on what the user actually sees when the navigation completes, catching regressions before they ship.

The [`@next/playwright`](https://www.npmjs.com/package/@next/playwright) package includes an `instant()` helper for this. Install it alongside `@playwright/test`:

```bash package="pnpm"
pnpm add -D @next/playwright @playwright/test
```

```bash package="npm"
npm install -D @next/playwright @playwright/test
```

```bash package="yarn"
yarn add -D @next/playwright @playwright/test
```

```bash package="bun"
bun add -D @next/playwright @playwright/test
```

A route can be reached two ways, and a `<Suspense>` boundary can cover one without covering the other:

- **Initial page load**: Use `page.goto()` to test the static UI from the document response.
- **Client navigation**: Click a `<Link>` to test the destination's prefetched UI. [Per-link prefetching](/docs/app/guides/optimizing-prefetching) can add request-specific content to this UI.

```typescript filename="e2e/navigation.test.ts" highlight={6-14,20-25}
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'

test.describe('Product page (/store/[slug])', () => {
  test('is instant on an initial page load', async ({ page, baseURL }) => {
    await instant(
      page,
      async () => {
        await page.goto('/store/hats')
        await expect(page.locator('h1')).toContainText('Baseball Cap')
        await expect(page.getByText('In stock')).toHaveCount(0)
      },
      { baseURL }
    )
    await expect(page.getByText('In stock')).toBeVisible()
  })

  test('is instant on a client navigation', async ({ page }) => {
    await page.goto('/store/shoes')
    await instant(page, async () => {
      await page.click('a[href="/store/hats"]')
      await page.waitForURL((url) => url.pathname === '/store/hats')
      await expect(page.locator('h1')).toContainText('Baseball Cap')
      await expect(page.getByText('In stock')).toHaveCount(0)
    })
    await expect(page.getByText('In stock')).toBeVisible()
  })
})
```

Pass Playwright's `baseURL` to `instant()` when `page.goto()` is the first navigation. The helper needs the origin before requesting the document.

Inside the callback, an initial page load shows the static UI and a client navigation shows the destination's prefetched UI. Other dynamic content remains blocked until the callback finishes.

> **Good to know:** The start of the `instant()` scope is the same as turning on **Pause on navigations** in the Navigation Inspector, and the end of the scope releases the pause the way **Resume** does.

For client navigations, wait for the destination URL before asserting on its UI. Otherwise, a shared selector can match the source page before the destination commits. If the prefetched destination cannot commit, the URL wait times out and the test fails.

Run these against `next dev`, where the testing API is enabled automatically. To run them in CI against a production build, set `exposeTestingApiInProductionBuild` so `next start` exposes the same API:

```ts filename="next.config.ts" highlight={5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: { exposeTestingApiInProductionBuild: true },
}

export default nextConfig
```

Focus these tests on the user flows that matter most.

## Fixing a navigation that blocks

Consider a different route, `/products/[slug]`, that fetches product data from a public API and shows a featured list alongside:

```tsx filename="app/products/[slug]/page.tsx"
export default async function ProductPage(
  props: PageProps<'/products/[slug]'>
) {
  const featured = await getFeatured()
  const { slug } = await props.params
  const res = await fetch(`https://next-recipe-api.vercel.dev/products/${slug}`)
  const product = await res.json()

  return (
    <div>
      <FeaturedSection items={featured} />
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <p>{product.description}</p>
    </div>
  )
}

async function getFeatured() {
  const res = await fetch('https://next-recipe-api.vercel.dev/products?limit=3')
  return res.json()
}
```

Two `fetch()` calls block at the top level: an uncached featured-list fetch and a per-slug product fetch (which also awaits `params`). Both will surface as Instant validation errors, one at a time.

### Step 1: Move the slug-dependent work into Suspense

Validation surfaces the per-slug product fetch first.

<div
  style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  }}
>
  <Image
    alt="Dev overlay insight for a blocking-route, showing the uncached data access on app/products/[slug]/page.tsx with Stream, Cache, and Block fix cards"
    srcLight="/docs/light/instant-insight.png"
    srcDark="/docs/dark/instant-insight.png"
    width="960"
    height="760"
  />
</div>

Extract the slug-dependent work into a sub-component and wrap it with `<Suspense>`:

```tsx filename="app/products/[slug]/page.tsx" highlight={21-23}
import { Suspense } from 'react'

async function ProductInfo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const res = await fetch(`https://next-recipe-api.vercel.dev/products/${slug}`)
  const product = await res.json()
  return (
    <>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <p>{product.description}</p>
    </>
  )
}

export default async function ProductPage(
  props: PageProps<'/products/[slug]'>
) {
  const featured = await getFeatured()
  return (
    <div>
      <FeaturedSection items={featured} />
      <Suspense fallback={<p>Loading product...</p>}>
        <ProductInfo params={props.params} />
      </Suspense>
    </div>
  )
}
```

Now `await props.params` and the product fetch suspend together. The product-fetch error clears, and validation moves on to the next blocker.

### Step 2: Cache the featured fetch

Validation now fires on `getFeatured()`.

<div
  style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  }}
>
  <Image
    alt="Dev overlay insight for the uncached getFeatured() fetch, with Stream, Cache, and Block fix cards"
    srcLight="/docs/light/instant-insight-4.png"
    srcDark="/docs/dark/instant-insight-4.png"
    width="960"
    height="760"
  />
</div>

Add a `"use cache"` directive to the fetching function:

```tsx filename="app/products/[slug]/page.tsx"
async function getFeatured() {
  'use cache'
  const res = await fetch('https://next-recipe-api.vercel.dev/products?limit=3')
  return res.json()
}
```

The result is cached at the fetch level. The featured list ships with the App Shell.

> **Good to know:** In serverless deployments, in-memory caching with `"use cache"` will not persist across instances. Consider using [`"use cache: remote"`](/docs/app/api-reference/directives/use-cache-remote) for persistent caching.

Validation passes. Open the DevTools and try a client navigation. The featured section appears immediately, and **"Loading product..."** shows where the product details will stream in.

### Iterate on loading states

{/* TODO: diagram — before/after illustration showing a single high-up Suspense boundary being refined down to smaller boundaries closer to the data */}

Validation passing means the navigation is instant. It does not mean the loading states are good. A `<Suspense>` boundary placed high in the tree (say, wrapping the whole page) might satisfy validation, but it replaces most of the page with a single fallback on every navigation.

The best loading states keep as much real, cached content visible as possible and only show fallbacks where data is actually in flight. A product page that keeps the header, image, and description visible with only the price and availability behind a fallback feels faster than a full-page skeleton, even at the same total load time.

Use the [DevTools](#visualize-loading-states-with-the-nextjs-devtools) to see what your users see, or see the [AI workflow](#ai-workflow) for automating the loop with an agent.

## AI workflow

At a high level, an agent optimizes a single navigation like this:

- **Observe**: read validation insights and choose the exact navigation and UI that should appear immediately.
- **Test**: confirm the target UI renders normally, then write an `instant()` test and verify that it fails before changing the route.
- **Fix**: validation errors name a specific component and suggest a fix (`use cache` or `<Suspense>`). The agent applies the fix and re-runs validation.
- **Verify**: run the test against a production-like build and keep the passing test as a regression guard.

The agent doesn't need to understand the full caching model, only to follow the insights and errors until they're gone. It does need your app-specific intent, though. Tell it what should appear immediately, what can stream in, and what must stay fresh. When a caching decision is unclear, keep the data fresh behind `<Suspense>` rather than guessing a cache lifetime.

For [iterating on loading states](#iterate-on-loading-states), a prompt like "maximize my content, and reduce the amount that needs to be behind a spinner" works well for pushing boundaries down.

Agents working on a Cache Components route typically reach for three levers:

- **Push down**: extract I/O into a Suspense-wrapped child so the parent stays static and static siblings lift into the shell.
- **Cache**: pair `'use cache'` with [`cacheLife`](/docs/app/api-reference/functions/cacheLife) to assign a freshness profile.
- **Per-link prefetching** (nav-only): when a route reads URL data (`searchParams` or `params`), opt it into [per-link prefetching](/docs/app/guides/optimizing-prefetching) so the framework resolves that data at link-prefetch time. Session data from `cookies()` or `headers()` already lands in the App Shell without it.

Each refactor should pair with a before/after capture to verify the change actually landed. Identical-looking captures mean the refactor didn't take effect.

For agents to see what their changes actually render, pair this with [agent-browser](https://github.com/vercel-labs/agent-browser). With React DevTools enabled it reports the component tree and which `<Suspense>` boundaries are still pending, so an agent can make a change, snapshot the shell, check what landed, and adjust. See [Runtime visibility](/docs/app/guides/ai-agents#step-2-give-agents-runtime-visibility) in the AI agents guide for the setup.

The [`next-cache-components-optimizer`](/docs/app/guides/ai-agents#next-cache-components-optimizer) Skill packages this loop. It confirms the target UI renders normally, writes an `instant()` test that fails before the fix, then works it to green against a production-like build and ships it as a regression guard. Use it for the initial load (hard navigation), client-side navigation (soft navigation), or both.

## Opting out

Not every layout or page can or should be instant. When the structural fix isn't worth the work, or when a route isn't a priority for instant navigation, refine validation at one of two scopes.

The dev overlay surfaces this as the **Block** fix alongside every insight:

<FixCardGrid>
  <FixCard
    group="block"
    title="Allow blocking route"
    href="/docs/messages/blocking-prerender-dynamic#allow-blocking-route"
    snippets={[
      { text: '// page.tsx or layout.tsx' },
      { text: 'export const instant = false', highlight: true },
    ]}
  />
</FixCardGrid>

Set `instant = false` on the page or layout file. This opts the segment out of validation feedback. The segment may still navigate instantly if its structure supports it; the framework just won't surface insights for it. Navigations between sibling segments below are still validated.

```tsx filename="app/dashboard/layout.tsx"
export const instant = false
```

With `false` on `/dashboard/layout.tsx`, validation no longer flags navigations into `/dashboard` from outside; navigations between `/dashboard/a` and `/dashboard/b` are still checked.

For opted-out segments, the navigation blocks on the server. If the content depends on cookies or headers but has a known cache lifetime, caching it with [`use cache: private`](/docs/app/api-reference/directives/use-cache-private) lets the App Shell carry it ahead of the click instead of opting out, as long as its [`stale`](/docs/app/api-reference/functions/cacheLife#stale) time is at least 5 minutes.

## Next steps

- [Adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching) for the recommended `<Link>` defaults and the migration path off `unstable_eager`
- [`instant` API reference](/docs/app/api-reference/file-conventions/route-segment-config/instant) for the full configuration
- [Optimizing prefetching](/docs/app/guides/optimizing-prefetching) when parts of your route depend on URL data (`searchParams` or `params`) and should resolve before navigation
- [Caching](/docs/app/getting-started/caching) for background on `use cache`, Suspense, and Partial Prerendering
- [Revalidating](/docs/app/getting-started/revalidating) for how to expire cached data with `cacheLife` and `updateTag`
