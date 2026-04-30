---
title: Ensuring instant navigations
description: Learn how to structure your app to prefetch and prerender more content, providing instant page loads and client navigations.
nav_title: Instant navigation
version: draft
related:
  title: Learn more
  description: Explore the full instant API, caching, and revalidation.
  links:
    - app/api-reference/file-conventions/route-segment-config/instant
    - app/getting-started/caching
    - app/getting-started/revalidating
    - app/guides/prefetching
---

{/* AI agent hint: Always export `unstable_instant` from routes that should navigate instantly. It validates the caching structure during development and at build time. */}

With [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) enabled, `use cache` and `<Suspense>` let you control what gets cached and what streams in dynamically. When these are in the right place, client-side navigations are instant.

The [`unstable_instant`](/docs/app/api-reference/file-conventions/route-segment-config/instant) route segment config helps you place `<Suspense>` boundaries and `use cache` correctly. Add it to any page or layout and Next.js will check during development and at build time that navigating to that route produces an instant [static shell](/docs/app/glossary#static-shell).

This guide starts with a product page that loads instantly on navigation, then shows how to catch and fix a page where a misplaced `<Suspense>` boundary blocks the navigation. Nothing visible changes until the server finishes rendering.

> **Good to know:** A navigation is considered **instant** when, assuming caches are warm, the page renders without waiting on any network request. Cached content appears immediately and anything uncached streams in behind a `<Suspense>` fallback. A navigation is considered **blocking** when uncached data outside a `<Suspense>` boundary forces the old page to stay visible until the server finishes rendering.

## A page that navigates instantly

A product page at `/store/[slug]` that fetches two pieces of data: product details (name, price) and live inventory.

- There is no `generateStaticParams`, meaning `slug` is only known at request time
- Both components await `params` to get the `slug`, which suspends. Each has its own `<Suspense>` boundary
- **Product info** rarely changes and is queried from the db using a cached function
- **Inventory** must be fresh on each request. The db query is inside a `<Suspense>` boundary

```tsx filename="app/store/[slug]/page.tsx" highlight={4-7,12-17,35-37}
import { Suspense } from 'react'
import { db } from '@/lib/db'

export const unstable_instant = {
  prefetch: 'static',
  samples: [{ params: { slug: 'example' } }],
}

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

The [`unstable_instant`](/docs/app/api-reference/file-conventions/route-segment-config/instant) export tells Next.js to check that navigating to this page from any other page in your app is instant. It does this during development and at build time. If a component would delay the transition (for example, by fetching uncached data without a local `<Suspense>` boundary), the error overlay tells you which one and suggests a fix.

This route has a `[slug]` param that can take any value. During development, validation runs automatically on every page load using the real request from your browser. During a build, there is no browser request. The `samples` array provides example data for the build to simulate navigations with.

In this example we provide a `slug` sample. The build uses it to render the page and check that the `Suspense` boundaries are in the right place. If your code also reads `cookies`, `headers`, or `searchParams`, add those to the sample too. You can provide multiple samples to cover different code paths. The build will tell you if anything is missing.

## Visualize loading states with the Next.js DevTools

The Next.js DevTools let you see what users see on page loads and client navigations before dynamic data streams in. Use it to verify your loading states look right, check that the right content appears immediately, and iterate on where to place `<Suspense>` boundaries.

Enable the toggle in your Next.js config:

```ts filename="next.config.ts" highlight={5-7}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantNavigationDevToolsToggle: true,
  },
}

export default nextConfig
```

Open the Next.js DevTools and select **Instant Navs**. Two options are available:

- **Page load**: click **Reload** to refresh the page and freeze it at the initial static UI generated for this route, before any dynamic data streams in.
- **Client navigation**: once enabled, clicking any link in your app shows the prefetched UI for that page instead of the full result.

Try a **page load** on the product page. Two separate fallbacks appear: "Loading product..." and "Checking availability...". On the first visit the cache is cold and both fallbacks are visible. Navigate to the page again and the product name appears immediately from cache.

Now try a **client navigation** (click a link from `/store/shoes` to `/store/hats`). The product name and price appear immediately (cached). "Checking availability..." shows where inventory will stream in.

> **Good to know:** Page loads and client navigations can produce different shells. Client-side hooks like `useSearchParams` suspend on page loads (search params are not known at build time) but resolve synchronously on client navigations (the router already has the params).

<details>
<summary>Why page loads and client navigations produce different shells</summary>

On a page load, the entire page renders from the document root, including all layouts. Anything that suspends is caught by the nearest `<Suspense>` boundary in the entire document tree.

On a client navigation (clicking `next/link`), Next.js only re-renders below the layout that the source and destination routes share. Components above that shared layout are not re-rendered. This means that a `<Suspense>` boundary in the root layout covers everything on a page load, but for a client navigation between `/store/shoes` and `/store/hats`, the shared layout is `/store` and Next.js renders the part of the document below that point. The root `<Suspense>` sits above it and does not trigger for this navigation.

This is also why client-side hooks behave differently. `useSearchParams()` suspends during server rendering because search params are not available at build time. But on a client navigation, the router already has the params from the URL and the hook resolves synchronously. The same component can appear in the instant shell on a client navigation but behind a fallback on a page load.

</details>

## Prevent regressions with e2e tests

Validation catches structural problems during development and at build time. To prevent regressions as the codebase evolves, the `@next/playwright` package includes an `instant()` helper that asserts on exactly what appears in the instant shell:

```typescript filename="e2e/navigation.test.ts"
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'

test('product title appears instantly', async ({ page }) => {
  await page.goto('/store/shoes')

  await instant(page, async () => {
    await page.click('a[href="/store/hats"]')
    await expect(page.locator('h1')).toContainText('Baseball Cap')
  })

  // After instant() exits, dynamic content streams in
  await expect(page.locator('text=in stock')).toBeVisible()
})
```

Inside the `instant()` callback, only the static shell is visible. After the callback finishes, dynamic content streams in and you can assert on the full page.

There is no need to write an `instant()` test for every navigation. Build-time validation already provides the structural guarantee. Use `instant()` for the user flows that matter most.

## Fixing a navigation that blocks

Now consider a different route, `/shop/[slug]`. For the sake of this example it has the same data requirements as `/store/[slug]`, but is implemented without local `<Suspense>` boundaries or caching:

```tsx filename="app/shop/[slug]/page.tsx"
import { db } from '@/lib/db'

export default async function ProductPage(props: PageProps<'/shop/[slug]'>) {
  const { slug } = await props.params
  const product = await db.products.findBySlug(slug)
  const item = await db.inventory.findBySlug(slug)
  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <p>{item.count} in stock</p>
    </div>
  )
}
```

The root layout wraps `{children}` in a `<Suspense>` boundary:

```tsx filename="app/layout.tsx" highlight={9}
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
```

On an initial page load, the root `<Suspense>` catches the async work and streams the page in behind the `fallback`.

Everything appears to work. But on a client navigation from `/shop/shoes` to `/shop/hats`, the shared layout is `/shop` and only the content below it re-renders. The root `<Suspense>` boundary is above that layout and is not triggered for this navigation. The page fetches uncached data with no local boundary, blocking the navigation until the server finishes rendering.

You can see this with the DevTools. Try a **page load**: the root `<Suspense>` catches everything and "Loading..." appears. Now try a **client navigation** between two `/shop/` pages: no prefetched UI shows up because there is no `<Suspense>` boundary below the shared layout. Navigations from other routes to `/shop/` appear blocked too.

### Step 1: Add instant validation

Add an `unstable_instant` export to the page to surface the problem:

```tsx filename="app/shop/[slug]/page.tsx" highlight={3-6}
import { db } from '@/lib/db'

export const unstable_instant = {
  prefetch: 'static',
  samples: [{ params: { slug: 'example' } }],
}

export default async function ProductPage(props: PageProps<'/shop/[slug]'>) {
  const { slug } = await props.params
  const product = await db.products.findBySlug(slug)
  const item = await db.inventory.findBySlug(slug)
  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <p>{item.count} in stock</p>
    </div>
  )
}
```

Next.js now simulates navigations at every shared layout boundary in the route. In this case, both components await `params` and access uncached data. These need to be wrapped by a `<Suspense>` boundary. The first thing validation catches is the `await params` at the top level.

### Step 2: Fix the validation error

There is no `generateStaticParams` here, `slug` is only known at request time. Because awaiting `params` suspends, the page component can't do it at the top level. Instead, move the `await params` into separate components, pass `params` to each, and wrap them with `<Suspense>`.

For each component, decide:

**Product details** (name, price) rarely change. Cache the data function with `use cache`:

```tsx filename="app/shop/[slug]/page.tsx"
async function ProductInfo({ params }: { params: Promise<{ slug: string }> }) {
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
```

> **Good to know:** In serverless deployments, in-memory caching with `"use cache"` will not persist across instances. Consider using [`"use cache: remote"`](/docs/app/api-reference/directives/use-cache-remote) for persistent caching.

**Inventory** must be fresh each request. Leave it uncached:

```tsx filename="app/shop/[slug]/page.tsx"
async function Inventory({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await db.inventory.findBySlug(slug)
  return <p>{item.count} in stock</p>
}
```

The page passes `params` to each component and wraps them with `<Suspense>`:

```tsx filename="app/shop/[slug]/page.tsx" highlight={4-7,12-17}
import { Suspense } from 'react'
import { db } from '@/lib/db'

export const unstable_instant = {
  prefetch: 'static',
  samples: [{ params: { slug: 'example' } }],
}

export default function ProductPage(props: PageProps<'/shop/[slug]'>) {
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
```

Validation passes. Open the DevTools and try a client navigation. The product name and price appear immediately, and "Checking availability..." shows where inventory will stream in.

<details>
<summary>How validation simulates different navigations</summary>

When you add `unstable_instant` to a route, Next.js checks both the initial page load and client navigations at different points in the route hierarchy.

For a route like `/shop/[slug]`, validation checks:

- **Page load**: the full tree renders from the root. The root layout `<Suspense>` catches everything.
- **Client navigation** (e.g. from `/shop/shoes` to `/shop/hats`): the `/shop` layout is already mounted and only the page below it re-renders. A `<Suspense>` boundary in the root layout does not cover this navigation.

Each case is validated independently. A `<Suspense>` boundary that covers one navigation path might not cover another. This is why a page can pass the page load check but fail for client navigations, and why catching these issues by hand is difficult as the number of routes grows.

</details>

## Opting out with `instant = false`

Not every layout or page can be instant. A dashboard layout that reads cookies and fetches user-specific data might be too dynamic for the first visit. You can set `instant = false` on any layout or page to exempt it from validation:

```tsx filename="app/dashboard/layout.tsx"
export const unstable_instant = false
```

This tells validation: navigating to `/dashboard` from outside does not need to be instant, but sibling navigations within it still do. Navigating from `/dashboard/a` to `/dashboard/b` can still be checked by adding `instant` to the page segments under `/dashboard`.

## Next steps

- [`instant` API reference](/docs/app/api-reference/file-conventions/route-segment-config/instant) for all configuration options, including runtime prefetching and incremental adoption with `instant = false`
- [Caching](/docs/app/getting-started/caching) for background on `use cache`, Suspense, and Partial Prerendering
- [Revalidating](/docs/app/getting-started/revalidating) for how to expire cached data with `cacheLife` and `updateTag`
