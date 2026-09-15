---
title: How to fetch client-side data with SWR
nav_title: SWR
description: Fetch client-side data with SWR, optionally provide initial data from a Server Component, and coordinate server and client caches.
related:
  description: Related guides and references.
  links:
    - app/getting-started/fetching-data
    - app/guides/single-page-applications
    - app/getting-started/caching
    - app/api-reference/directives/use-cache
    - app/api-reference/file-conventions/route
    - app/api-reference/functions/updateTag
---

Use [SWR](https://swr.vercel.app) to fetch data in Client Components, provide initial data from Server Components, and coordinate browser mutations with cached server data. See [Client-side data fetching](/docs/app/guides/client-side-data-fetching) to choose a pattern.

## Fetch data on the client

SWR can fetch entirely in the browser when the initial view can wait for a browser request after hydration. Choose an [inline or Suspense loading state](/docs/app/guides/client-side-data-fetching#choose-a-client-fetching-pattern) based on where the loading UI should appear. In these examples, `query` starts empty and updates from client state after hydration.

Use `useSWR` when the component should render its own loading and error states. A conditional key delays the request until the interaction provides an input:

```tsx filename="app/product-autocomplete.tsx"
'use client'

import useSWR from 'swr'

type Product = { id: string; name: string }

async function fetcher(url: string): Promise<Product[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch products')
  return response.json()
}

export function ProductAutocomplete({ query }: { query: string }) {
  const {
    data = [],
    error,
    isLoading,
  } = useSWR(
    query ? `/api/products?query=${encodeURIComponent(query)}` : null,
    fetcher
  )

  if (!query) return null
  if (error) return <p>Failed to load products.</p>
  if (isLoading) return <p>Loading products...</p>

  return (
    <ul>
      {data.map((product) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  )
}
```

## Use Suspense for client data

Use `suspense: true` when the nearest Suspense boundary should define the loading UI. Keep the interactive shell outside the boundary so it remains available while the results load:

```tsx filename="app/product-autocomplete.tsx"
'use client'

import { Suspense } from 'react'
import useSWR from 'swr'

type Product = { id: string; name: string }

async function fetcher(url: string): Promise<Product[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch products')
  return response.json()
}

export function ProductAutocomplete({ query }: { query: string }) {
  if (!query) return null

  return (
    <Suspense fallback={<p>Loading products...</p>}>
      <ProductResults query={query} />
    </Suspense>
  )
}

function ProductResults({ query }: { query: string }) {
  const { data } = useSWR(
    `/api/products?query=${encodeURIComponent(query)}`,
    fetcher,
    { suspense: true }
  )

  return (
    <ul>
      {data.map((product) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  )
}
```

With an unconditional key, SWR defines `data` after Suspense resolves. Handle request errors with the nearest [error boundary](/docs/app/getting-started/error-handling#nested-error-boundaries).

The `isLoading` value is `true` when a request is running and there is no loaded data to display. The `isValidating` value is `true` whenever a request is running, including background revalidation.

With `suspense: true`, Suspense handles the initial no-data state. Later revalidation for the same key keeps the current data rendered instead of showing the Suspense fallback again. Use `isValidating` to provide background refresh feedback. Learn more about [SWR loading states](https://swr.vercel.app/docs/advanced/understanding#combining-with-isloading-and-isvalidating-for-better-ux).

Learn more: [SWR data fetching](https://swr.vercel.app/docs/data-fetching).

> **Good to know:** Independent Suspense reads can start in parallel when they render in sibling components. Multiple Suspense reads in one component run sequentially. Learn more about [network waterfalls](/docs/app/guides/migrating/from-create-react-app#network-waterfalls) and [SWR Suspense](https://swr.vercel.app/docs/suspense).

## Provide initial data from a Server Component

Use the [server-provided data pattern](/docs/app/guides/client-side-data-fetching#choose-a-client-fetching-pattern) when the initial render needs the data and SWR should continue managing it in the browser. With SWR 2.3.0 and React 19, a Server Component can provide fallback data before the client takes over.

Scope `<SWRConfig>` to the route segment that owns the data. The provider keeps the `fallback` close to its consumer and avoids adding feature data to a shared layout:

```tsx filename="app/products/[id]/page.tsx" switcher
import { Suspense } from 'react'
import { SWRConfig } from 'swr'
import { getProduct } from './data' // some server-side function
import { productCache } from './product-cache'
import { ProductView } from './product-view'

export default function Page({ params }: PageProps<'/products/[id]'>) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      {params.then(({ id }) => (
        <ProductData id={id} />
      ))}
    </Suspense>
  )
}

function ProductData({ id }: { id: string }) {
  return (
    <SWRConfig
      value={{
        fallback: {
          // Not awaited: only components that read this key suspend
          [productCache.key(id)]: getProduct(id),
        },
      }}
    >
      <ProductView id={id} />
    </SWRConfig>
  )
}
```

```jsx filename="app/products/[id]/page.js" switcher
import { Suspense } from 'react'
import { SWRConfig } from 'swr'
import { getProduct } from './data' // some server-side function
import { productCache } from './product-cache'
import { ProductView } from './product-view'

export default function Page({ params }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      {params.then(({ id }) => (
        <ProductData id={id} />
      ))}
    </Suspense>
  )
}

function ProductData({ id }) {
  return (
    <SWRConfig
      value={{
        fallback: {
          // Not awaited: only components that read this key suspend
          [productCache.key(id)]: getProduct(id),
        },
      }}
    >
      <ProductView id={id} />
    </SWRConfig>
  )
}
```

The fallback and Client Component must use the same SWR key. Define the key once so both call sites share the same identity:

```ts filename="app/products/[id]/product-cache.ts" switcher
export const productCache = {
  key: (id: string) => `/api/products/${id}`,
}
```

```js filename="app/products/[id]/product-cache.js" switcher
export const productCache = {
  key: (id) => `/api/products/${id}`,
}
```

In the page example, the Promise returned by `params.then()` keeps the fallback visible until the route parameters resolve. `ProductData` then creates a separate, unawaited `getProduct(id)` Promise for the SWR `fallback`. React passes that Promise through the React Server Component payload, and the component reading the matching key suspends until the data resolves.

The Client Component reads the data with `useSWR` using the same key:

```tsx filename="app/products/[id]/product-view.tsx" switcher
'use client'

import useSWR from 'swr'
import { productCache } from './product-cache'

type Product = { id: string; name: string }

async function fetcher(url: string): Promise<Product> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch product')
  return response.json()
}

export function ProductView({ id }: { id: string }) {
  const { data } = useSWR(productCache.key(id), fetcher, { suspense: true })

  return <h1>{data.name}</h1>
}
```

```jsx filename="app/products/[id]/product-view.js" switcher
'use client'

import useSWR from 'swr'
import { productCache } from './product-cache'

async function fetcher(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch product')
  return response.json()
}

export function ProductView({ id }) {
  const { data } = useSWR(productCache.key(id), fetcher, { suspense: true })

  return <h1>{data.name}</h1>
}
```

> **Good to know:** The `fallback` key and the `useSWR` key must match exactly. If they drift, SWR ignores the fallback value and fetches on the client.

The `fallback` provides the hook's initial value. By default, SWR treats fallback data as stale and starts a browser revalidation after hydration.

SWR does not provide a time-based freshness window for fallback data. Setting `revalidateIfStale: false` skips revalidation when the hook mounts with cached data. This setting applies to every mount, unlike TanStack Query's `staleTime`.

Focus, reconnect, polling, and `mutate` can still revalidate the key. To refresh on a schedule, set [`refreshInterval`](https://swr.vercel.app/docs/revalidation#revalidate-on-interval).

The SWR key points to a [Route Handler](/docs/app/api-reference/file-conventions/route) with a `GET` method. The Route Handler can call the same `getProduct` function that provides the fallback, while the browser uses the URL for revalidation and polling.

Learn more: [SWR arguments and keys](https://swr.vercel.app/docs/arguments) and [SWR with Next.js App Router](https://swr.vercel.app/docs/with-nextjs).

## Cache server-provided data with Cache Components

Enable [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) in `next.config.ts` before using this pattern. You can then cache the server data used as the SWR fallback. Add [`use cache`](/docs/app/api-reference/directives/use-cache), choose a [`cacheLife`](/docs/app/api-reference/functions/cacheLife) profile, and apply [`cacheTag`](/docs/app/api-reference/functions/cacheTag) so mutations can invalidate it:

```ts filename="app/products/[id]/data.ts" switcher
import { cacheLife, cacheTag } from 'next/cache'

export async function getProduct(id: string) {
  'use cache'
  cacheLife('max')
  cacheTag(`product:${id}`)

  const product = await db.product.findUnique({ where: { id } })
  if (!product) throw new Error('Product not found')
  return product
}
```

```js filename="app/products/[id]/data.js" switcher
import { cacheLife, cacheTag } from 'next/cache'

export async function getProduct(id) {
  'use cache'
  cacheLife('max')
  cacheTag(`product:${id}`)

  const product = await db.product.findUnique({ where: { id } })
  if (!product) throw new Error('Product not found')
  return product
}
```

This example uses `cacheLife('max')` because writes invalidate the product tag. Within the cache profile, `stale` controls how long the Next.js client cache can reuse a prefetched payload, while `revalidate` and `expire` control the server cache. Choose a shorter profile when the server value should refresh with time.

SWR owns a separate browser cache, so its revalidation options do not need to match `cacheLife`.

When the same mutation updates the browser cache and invalidates cached server data, you may define both identities in one shared contract:

```diff filename="app/products/[id]/product-cache.ts" switcher
 export const productCache = {
   key: (id: string) => `/api/products/${id}`,
+  tag: (id: string) => `product:${id}`,
 }
```

```diff filename="app/products/[id]/product-cache.js" switcher
 export const productCache = {
   key: (id) => `/api/products/${id}`,
+  tag: (id) => `product:${id}`,
 }
```

The server function can then call `cacheTag(productCache.tag(id))`. Keep this contract free of server-only and client-only imports so both cache layers can reuse it.

## Coordinate server and client caches after mutations

The fallback provides the initial value. After hydration, SWR manages the browser cache and revalidation. For reused data, keep the SWR key and server tag in the same cache contract:

```ts filename="app/activity/activity-cache.ts" switcher
export const activityCache = {
  key: '/api/activity/unread',
  tag: (userId: string) => `activity:${userId}`,
}
```

```js filename="app/activity/activity-cache.js" switcher
export const activityCache = {
  key: '/api/activity/unread',
  tag: (userId) => `activity:${userId}`,
}
```

Use the same key for the fallback, the Client Component read, and the mutation. With SWR, pass the write to [`mutate`](https://swr.vercel.app/docs/mutation) and provide `optimisticData`. SWR shows the optimistic value immediately and rolls it back if the write fails. This example keeps the optimistic value after the action succeeds because the final value is known:

```tsx filename="app/activity/mark-read-button.tsx" switcher
'use client'

import { useSWRConfig } from 'swr'
import { markActivityReadAction } from './actions'
import { activityCache } from './activity-cache'

export function MarkReadButton() {
  const { mutate } = useSWRConfig()

  function markRead() {
    return mutate(
      activityCache.key,
      async () => {
        await markActivityReadAction()
        return { count: 0 }
      },
      {
        optimisticData: { count: 0 },
        revalidate: false,
        rollbackOnError: true,
        throwOnError: false,
      }
    )
  }

  return <button onClick={markRead}>Mark read</button>
}
```

```jsx filename="app/activity/mark-read-button.js" switcher
'use client'

import { useSWRConfig } from 'swr'
import { markActivityReadAction } from './actions'
import { activityCache } from './activity-cache'

export function MarkReadButton() {
  const { mutate } = useSWRConfig()

  function markRead() {
    return mutate(
      activityCache.key,
      async () => {
        await markActivityReadAction()
        return { count: 0 }
      },
      {
        optimisticData: { count: 0 },
        revalidate: false,
        rollbackOnError: true,
        throwOnError: false,
      }
    )
  }

  return <button onClick={markRead}>Mark read</button>
}
```

The Server Action writes to the database and expires the tagged server data with [`updateTag`](/docs/app/api-reference/functions/updateTag). Tag the cached server query with [`cacheTag`](/docs/app/api-reference/functions/cacheTag) so the tag matches:

```ts filename="app/activity/actions.ts" switcher
'use server'

import { updateTag } from 'next/cache'
import {
  getCurrentUserId,
  markActivityRead as markActivityReadInDatabase,
} from './data'
import { activityCache } from './activity-cache'

export async function markActivityReadAction() {
  const userId = await getCurrentUserId()
  await markActivityReadInDatabase(userId)
  updateTag(activityCache.tag(userId))
}
```

```js filename="app/activity/actions.js" switcher
'use server'

import { updateTag } from 'next/cache'
import {
  getCurrentUserId,
  markActivityRead as markActivityReadInDatabase,
} from './data'
import { activityCache } from './activity-cache'

export async function markActivityReadAction() {
  const userId = await getCurrentUserId()
  await markActivityReadInDatabase(userId)
  updateTag(activityCache.tag(userId))
}
```

The optimistic SWR value updates the current screen. `updateTag` ensures the next cached server read returns fresh activity.

> **Good to know:** Call `updateTag` when a Server Action changes a cached read that must reflect the write immediately. An uncached read does not have a server tag to update. See [Client-side data fetching](/docs/app/guides/client-side-data-fetching#coordinate-mutations) for other invalidation behaviors.

See the [live `next-spa-patterns` demo](https://next-spa-patterns.labs.vercel.dev/swr) and its [source code](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/swr). Learn more about [SWR mutation and optimistic updates](https://swr.vercel.app/docs/mutation) and the [SWR documentation](https://swr.vercel.app/docs/getting-started).
