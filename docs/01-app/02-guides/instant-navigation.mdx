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

With [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) enabled, wrapping uncached data in `<Suspense>` boundaries produces instant navigations — but only if the boundaries are in the right place. A misplaced boundary can silently block client-side navigations, especially where the entry point varies by shared layout. **Always export `unstable_instant` from routes that should navigate instantly** — it validates the caching structure at dev time and build time, catching issues before they reach users.

This guide starts with a product page that navigates instantly, then shows how to catch and fix a page where Suspense boundaries are not in the right place.

## A page that navigates instantly

A product page at `/store/[slug]` that fetches two things: product details (name, price) and live inventory. Product details rarely change, so they are cached with `use cache`. Inventory must be fresh and streams behind its own `<Suspense>` fallback:

```tsx filename="app/store/[slug]/page.tsx" highlight={1,12-19,25}
export const unstable_instant = { prefetch: 'static' }

import { Suspense } from 'react'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading product...</p>}>
        {params.then(({ slug }) => (
          <ProductInfo slug={slug} />
        ))}
      </Suspense>
      <Suspense fallback={<p>Checking availability...</p>}>
        <Inventory params={params} />
      </Suspense>
    </div>
  )
}

async function ProductInfo({ slug }: { slug: string }) {
  'use cache'
  const product = await fetchProduct(slug)
  return (
    <>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </>
  )
}

async function Inventory({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const inventory = await fetchInventory(slug)
  return <p>{inventory.count} in stock</p>
}
```

There is no `generateStaticParams`, so `[slug]` is a dynamic segment and `slug` is only known at request time. Awaiting `params` suspends, which is why each component that reads it has its own `<Suspense>` boundary. The `params` Promise is resolved inline with `.then()` so the cached `ProductInfo` receives a plain `slug` string.

The [`unstable_instant`](/docs/app/api-reference/file-conventions/route-segment-config/instant) export on line 1 tells Next.js to validate that this page produces an instant [static shell](/docs/app/glossary#static-shell) at every possible entry point. Validation runs during development and at build time. If a component would block navigation, the error overlay tells you exactly which one and suggests a fix.

### Inspect it with the Next.js DevTools

Enable the Instant Navigation DevTools toggle in your Next.js config:

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

Open the Next.js DevTools and select **Instant Navs**. You will see two options:

- **Page load**: click **Reload** to refresh the page and freeze it at the initial static UI generated for this route, before any dynamic data streams in.
- **Client navigation**: once enabled, clicking any link in your app shows the prefetched UI for that page instead of the full result.

Try a **page load**. "Loading product..." and "Checking availability..." appear as separate fallbacks. On the first visit the cache is cold, so both fallbacks are visible. Navigate to the page again and the product name appears immediately from cache.

Now try a **client navigation** (click a link from `/store/shoes` to `/store/hats`). The product name and price appear immediately (cached). "Checking availability..." shows where inventory will stream in.

> **Good to know:** Page loads and client navigations can produce different shells. Client-side hooks like `useSearchParams` suspend on page loads (search params are not known at build time) but resolve synchronously on client navigations (the router already has the params).

<details>
<summary>Why page loads and client navigations produce different shells</summary>

On a page load, the entire page renders from the document root. Every component runs on the server, and anything that suspends is caught by the nearest Suspense boundary in the full tree.

On a client navigation (link click), Next.js only re-renders below the layout that the source and destination routes share. Components above that shared layout are not re-rendered. This means a Suspense boundary in the root layout covers everything on a page load, but for a client navigation between `/store/shoes` and `/store/hats`, the shared `/store` layout is the entry point. The root Suspense sits above it and has no effect.

This is also why client-side hooks behave differently. `useSearchParams()` suspends during server rendering because search params are not available at build time. But on a client navigation, the router already has the params from the URL, so the hook resolves synchronously. The same component can appear in the instant shell on a client navigation but behind a fallback on a page load.

</details>

### Prevent regressions with e2e tests

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

`instant()` holds back dynamic content while the callback runs against the static shell. After it resolves, dynamic content streams in and you can assert on the full page.

There is no need to write an `instant()` test for every navigation. Build-time validation already provides the structural guarantee. Use `instant()` for the user flows that matter most.

## Fixing a page that blocks

Now consider a different route, `/shop/[slug]`, that has the same data requirements but without local Suspense boundaries or caching:

```tsx filename="app/shop/[slug]/page.tsx"
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await fetchProduct(slug)
  const inventory = await fetchInventory(slug)
  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <p>{inventory.count} in stock</p>
    </div>
  )
}
```

The root layout wraps `{children}` in `<Suspense>`:

```tsx filename="app/layout.tsx" highlight={9-11}
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

On an initial page load, the root Suspense catches the async work and streams the page in behind the fallback. Everything appears to work. But on a client navigation from `/shop/shoes` to `/shop/hats`, the shared `/shop` layout is the entry point. The root `<Suspense>` boundary is above that layout, so it is invisible to this navigation. The page fetches uncached data with no local boundary, so the old page stays visible until the server finishes renderingm making the navigation feel unresponsive.

### Step 1: Add instant validation

Add the `unstable_instant` export to surface the problem:

```tsx filename="app/shop/[slug]/page.tsx" highlight={1}
export const unstable_instant = { prefetch: 'static' }

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await fetchProduct(slug)
  const inventory = await fetchInventory(slug)
  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <p>{inventory.count} in stock</p>
    </div>
  )
}
```

Next.js now simulates navigations at every shared layout boundary in the route. Awaiting `params` and both data fetches are flagged as violations because they suspend or access uncached data outside a Suspense boundary. Each error identifies the specific component and suggests a fix.

### Step 2: Fix the errors

Look at the data. There is no `generateStaticParams`, so `slug` is only known at request time. Awaiting `params` suspends, so every component that reads it needs its own `<Suspense>` boundary.

Decide what to do with each fetch:

- **Product details** (name, price) rarely change. Cache them as a function of `slug` with `use cache`.
- **Inventory** must be fresh from upstream. Leave it uncached and let it stream behind a `<Suspense>` fallback.

The result is the same structure from the first section:

```tsx filename="app/shop/[slug]/page.tsx" highlight={1,12-19,25}
export const unstable_instant = { prefetch: 'static' }

import { Suspense } from 'react'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading product...</p>}>
        {params.then(({ slug }) => (
          <ProductInfo slug={slug} />
        ))}
      </Suspense>
      <Suspense fallback={<p>Checking availability...</p>}>
        <Inventory params={params} />
      </Suspense>
    </div>
  )
}

async function ProductInfo({ slug }: { slug: string }) {
  'use cache'
  const product = await fetchProduct(slug)
  return (
    <>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </>
  )
}

async function Inventory({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const inventory = await fetchInventory(slug)
  return <p>{inventory.count} in stock</p>
}
```

Validation passes. Open the DevTools and try a client navigation. The product name and price appear immediately, and "Checking availability..." shows where inventory will stream in.

<details>
<summary>How validation checks every entry point</summary>

When you add `unstable_instant` to a route, Next.js does not only check the initial page load. It simulates navigations at every possible shared layout boundary in the route hierarchy.

For a route like `/shop/[slug]`, validation checks:

- Entry from outside (page load): the full tree renders, root layout Suspense catches everything
- Entry from a sibling under `/shop` (client navigation from `/shop/shoes` to `/shop/hats`): only the page segment re-renders, the `/shop` layout is the entry point

Each entry point is validated independently. A Suspense boundary that covers one path might be invisible to another. This is why a page can pass the initial load check but fail for sibling navigations, and why catching these issues by hand is difficult as the number of routes grows.

</details>

## Opting out with `instant = false`

Not every layout can be instant. A dashboard layout that reads cookies and fetches user-specific data might be too dynamic for the first entry. You can set `instant = false` on that layout to exempt it from validation:

```tsx filename="app/dashboard/layout.tsx"
export const unstable_instant = false
```

This tells validation: do not require that entry into `/dashboard` is instant, but still allows you to validate sibling navigations within it by using `instant` on those inner segments. Navigating from `/dashboard/a` to `/dashboard/b` can still be checked by adding `instant` to the page segments under `/dashboard`.

## Next steps

- [`instant` API reference](/docs/app/api-reference/file-conventions/route-segment-config/instant) for all configuration options, including runtime prefetching and incremental adoption with `instant = false`
- [Caching](/docs/app/getting-started/caching) for background on `use cache`, Suspense, and Partial Prerendering
- [Revalidating](/docs/app/getting-started/revalidating) for how to expire cached data with `cacheLife` and `updateTag`
