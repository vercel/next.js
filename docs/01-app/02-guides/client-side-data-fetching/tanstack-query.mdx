---
title: How to fetch client-side data with TanStack Query
nav_title: TanStack Query
description: Fetch client-side data with TanStack Query, optionally provide initial data from a Server Component, and coordinate server and client caches.
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

Use [TanStack Query](https://tanstack.com/query) to fetch data in Client Components, provide initial data from Server Components, and coordinate browser mutations with cached server data. See [Client-side data fetching](/docs/app/guides/client-side-data-fetching) to choose a pattern.

## Set up the provider

Wrap the routes that use TanStack Query in a `QueryClientProvider`. Create a new query client for each server render and reuse one query client in the browser:

```tsx filename="app/products/providers.tsx"
'use client'

import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  // Keep server requests isolated and preserve the browser cache across renders.
  if (typeof window === 'undefined') return new QueryClient()
  browserQueryClient ??= new QueryClient()
  return browserQueryClient
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  )
}
```

Render the provider from the nearest shared layout:

```tsx filename="app/products/layout.tsx"
import { Providers } from './providers'

export default function Layout({ children }: LayoutProps<'/products'>) {
  return <Providers>{children}</Providers>
}
```

See the [complete provider setup in the demo source](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/react-query) or learn about provider options in the [TanStack Query Advanced SSR guide](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).

## Fetch data on the client

TanStack Query can fetch entirely in the browser when the initial view can wait for a browser request after hydration. Choose an [inline or Suspense loading state](/docs/app/guides/client-side-data-fetching#choose-a-client-fetching-pattern) based on where the loading UI should appear. In these examples, `query` starts empty and updates from client state after hydration.

Use `useQuery` when the component should render its own loading and error states. The `enabled` option delays the request until the interaction provides an input:

```tsx filename="app/product-autocomplete.tsx"
'use client'

import { useQuery } from '@tanstack/react-query'

type Product = { id: string; name: string }

async function searchProducts(query: string): Promise<Product[]> {
  const response = await fetch(
    `/api/products?query=${encodeURIComponent(query)}`
  )
  if (!response.ok) throw new Error('Failed to fetch products')
  return response.json()
}

export function ProductAutocomplete({ query }: { query: string }) {
  const {
    data = [],
    error,
    isPending,
  } = useQuery({
    queryKey: ['product-search', query],
    queryFn: () => searchProducts(query),
    enabled: query.length > 0,
  })

  if (!query) return null
  if (error) return <p>Failed to load products.</p>
  if (isPending) return <p>Loading products...</p>

  return (
    <ul>
      {data.map((product) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  )
}
```

Learn more: [TanStack Query queries](https://tanstack.com/query/latest/docs/framework/react/guides/queries).

## Use Suspense for client data

Use `useSuspenseQuery` when the nearest Suspense boundary should define the loading UI. Keep the interactive shell outside the boundary so it remains available while the results load:

```tsx filename="app/product-autocomplete.tsx"
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

type Product = { id: string; name: string }

async function searchProducts(query: string): Promise<Product[]> {
  const response = await fetch(
    `/api/products?query=${encodeURIComponent(query)}`
  )
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
  const { data } = useSuspenseQuery({
    queryKey: ['product-search', query],
    queryFn: () => searchProducts(query),
  })

  return (
    <ul>
      {data.map((product) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  )
}
```

If the initial request fails, `useSuspenseQuery` propagates the error to the nearest [error boundary](/docs/app/getting-started/error-handling#nested-error-boundaries).

After a query has data, later refetches for the same query keep the cached data rendered instead of showing the Suspense fallback again. Use `isFetching` to provide background refresh feedback.

If the initial view needs the data, provide it from a Server Component as shown below.

> **Good to know:** Multiple `useSuspenseQuery` calls in one component run sequentially. Put independent queries in sibling components, or use [`useSuspenseQueries`](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQueries). Learn more about [request waterfalls](https://tanstack.com/query/latest/docs/framework/react/guides/request-waterfalls).

## Provide initial data from a Server Component

Use the [server-provided data pattern](/docs/app/guides/client-side-data-fetching#choose-a-client-fetching-pattern) when the initial render needs the data and TanStack Query should continue managing it in the browser. A Server Component can provide initial query data before the client takes over.

TanStack Query 5.40.0 or later can dehydrate pending queries. Start `prefetchQuery` without awaiting it, then pass the dehydrated state to `<HydrationBoundary>`. Override `queryFn` on the server because the Route Handler's relative URL only resolves in the browser:

```tsx filename="app/products/[id]/page.tsx" switcher
import { Suspense } from 'react'
import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query'
import { getProduct } from './data'
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
  const queryClient = new QueryClient()

  // Not awaited, so rendering is not blocked.
  void queryClient.prefetchQuery({
    ...productCache.options(id),
    queryFn: () => getProduct(id),
  })

  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      })}
    >
      <ProductView id={id} />
    </HydrationBoundary>
  )
}
```

```jsx filename="app/products/[id]/page.js" switcher
import { Suspense } from 'react'
import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query'
import { getProduct } from './data'
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
  const queryClient = new QueryClient()

  // Not awaited, so rendering is not blocked.
  void queryClient.prefetchQuery({
    ...productCache.options(id),
    queryFn: () => getProduct(id),
  })

  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      })}
    >
      <ProductView id={id} />
    </HydrationBoundary>
  )
}
```

The server and Client Component must use the same query key. Keep the key and query options together so both call sites share the same identity:

```ts filename="app/products/[id]/product-cache.ts" switcher
import { queryOptions } from '@tanstack/react-query'

export type Product = { id: string; name: string }

export const productCache = {
  key: (id: string) => ['product', id] as const,
  options: (id: string) =>
    queryOptions({
      queryKey: productCache.key(id),
      queryFn: async (): Promise<Product> => {
        const res = await fetch(`/api/products/${id}`)
        if (!res.ok) throw new Error('Failed to fetch product')
        return res.json()
      },
      staleTime: 30_000,
    }),
}
```

```js filename="app/products/[id]/product-cache.js" switcher
import { queryOptions } from '@tanstack/react-query'

export const productCache = {
  key: (id) => ['product', id],
  options: (id) =>
    queryOptions({
      queryKey: productCache.key(id),
      queryFn: async () => {
        const res = await fetch(`/api/products/${id}`)
        if (!res.ok) throw new Error('Failed to fetch product')
        return res.json()
      },
      staleTime: 30_000,
    }),
}
```

The query function fetches a [Route Handler](/docs/app/api-reference/file-conventions/route) so it can run on the client. The `staleTime` prevents an immediate client refetch by keeping the hydrated data fresh for 30 seconds. Choose a duration based on how quickly the data can change.

Larger features can place query options in a separate client-facing module as long as every caller imports the key from the same cache contract. Learn more about [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

As with SWR, `params.then()` resolves the `id` inside `<Suspense>`, and `ProductData` prefetches below the boundary.

The Client Component reads the same query key with `useSuspenseQuery` (or `useQuery` to render `isPending` and `error` states inline):

```tsx filename="app/products/[id]/product-view.tsx" switcher
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { productCache } from './product-cache'

export function ProductView({ id }: { id: string }) {
  const { data } = useSuspenseQuery(productCache.options(id))

  return <h1>{data.name}</h1>
}
```

```jsx filename="app/products/[id]/product-view.js" switcher
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { productCache } from './product-cache'

export function ProductView({ id }) {
  const { data } = useSuspenseQuery(productCache.options(id))

  return <h1>{data.name}</h1>
}
```

Learn more: [TanStack Query Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).

## Cache server-provided data with Cache Components

Enable [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) in `next.config.ts` before using this pattern. You can then cache the server data provided to TanStack Query. Add [`use cache`](/docs/app/api-reference/directives/use-cache), choose a [`cacheLife`](/docs/app/api-reference/functions/cacheLife) profile, and apply [`cacheTag`](/docs/app/api-reference/functions/cacheTag) so mutations can invalidate it:

```ts filename="app/products/[id]/data.ts" switcher
import { cacheLife, cacheTag } from 'next/cache'
import type { Product } from './product-cache'

export async function getProduct(id: string): Promise<Product> {
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

TanStack Query owns a separate browser cache, so its `staleTime` does not need to match `cacheLife`.

With Cache Components enabled, Next.js also prerenders Client Components. Keep a query needed during the initial render behind [Suspense](/docs/app/getting-started/fetching-data#streaming). TanStack Query can read the current time while creating active query state, and the boundary lets Next.js defer that work instead of raising a [current-time prerender error](/docs/messages/blocking-prerender-current-time-client).

When the same mutation updates the browser cache and invalidates cached server data, you may define both identities in one shared contract:

```diff filename="app/products/[id]/product-cache.ts" switcher
 export const productCache = {
   key: (id: string) => ['product', id] as const,
+  tag: (id: string) => `product:${id}`,
   // ...
 }
```

```diff filename="app/products/[id]/product-cache.js" switcher
 export const productCache = {
   key: (id) => ['product', id],
+  tag: (id) => `product:${id}`,
   // ...
 }
```

The server function can then call `cacheTag(productCache.tag(id))`. Keep this contract free of server-only and client-only imports so both cache layers can reuse it.

> **Good to know:** TanStack Query's `dehydrate()` reads the current time during Cache Components prerendering. Use the [prerenderable hydration helper](#build-a-prerenderable-hydration-state) for cached initial data.

## Coordinate server and client caches after mutations

Hydration provides the initial client cache value. After hydration, TanStack Query owns the browser copy and its revalidation. For reused data, keep the query key and server tag in the same cache contract:

```ts filename="app/activity/activity-cache.ts" switcher
export const activityCache = {
  key: ['activity', 'unread'] as const,
  tag: (userId: string) => `activity:${userId}`,
}
```

```js filename="app/activity/activity-cache.js" switcher
export const activityCache = {
  key: ['activity', 'unread'],
  tag: (userId) => `activity:${userId}`,
}
```

On mutation, use `useMutation`'s [`onMutate`](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) callback to update the cache immediately and restore the previous value in `onError` if the write fails. This example keeps the optimistic value after the action succeeds because the final value is known:

```tsx filename="app/activity/mark-read-button.tsx" switcher
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { markActivityReadAction } from './actions'
import { activityCache } from './activity-cache'

export function MarkReadButton() {
  const queryClient = useQueryClient()
  const queryKey = activityCache.key

  const markRead = useMutation({
    mutationFn: markActivityReadAction,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, { count: 0 })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
  })

  return <button onClick={() => markRead.mutate()}>Mark read</button>
}
```

```jsx filename="app/activity/mark-read-button.js" switcher
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { markActivityReadAction } from './actions'
import { activityCache } from './activity-cache'

export function MarkReadButton() {
  const queryClient = useQueryClient()
  const queryKey = activityCache.key

  const markRead = useMutation({
    mutationFn: markActivityReadAction,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, { count: 0 })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
  })

  return <button onClick={() => markRead.mutate()}>Mark read</button>
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

The optimistic query value updates the current screen. `updateTag` ensures the next cached server read returns fresh activity.

> **Good to know:** Call `updateTag` when a Server Action changes a cached read that must reflect the write immediately. An uncached read does not have a server tag to update. See [Client-side data fetching](/docs/app/guides/client-side-data-fetching#coordinate-mutations) for other invalidation behaviors.

## Build a prerenderable hydration state

The TanStack Query pattern above uses `dehydrate()` to create the hydration state. With Cache Components, `dehydrate()` reads the current time (`Date.now()`) while prerendering and causes a [current-time prerender error](/docs/messages/blocking-prerender-current-time).

Instead, cache only that timestamp and build the dehydrated state by hand. Wrap the time read in [`use cache`](/docs/app/api-reference/directives/use-cache) with the same tags as the data reads. When a mutation invalidates those tags, the data and its timestamp advance together, so `<HydrationBoundary>` overwrites the client query on the next navigation:

```tsx filename="app/lib/hydrate.ts" switcher
import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import {
  defaultShouldDehydrateQuery,
  QueryClient,
  type DehydratedState,
  type QueryKey,
} from '@tanstack/react-query'

type HydratedQuery = {
  queryKey: QueryKey
  data: unknown
}

type HydrationOptions = {
  tags: string[]
}

async function getHydrationUpdatedAt(tags: string[]) {
  'use cache'
  cacheTag(...tags)
  cacheLife('max')
  return Date.now()
}

export async function dehydrate(
  queries: HydratedQuery[],
  options: HydrationOptions
): Promise<DehydratedState> {
  const updatedAt = await getHydrationUpdatedAt(options.tags)

  const queryClient = new QueryClient()

  for (const query of queries) {
    queryClient.setQueryData(query.queryKey, query.data, { updatedAt })
  }

  return {
    mutations: [],
    queries: queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => defaultShouldDehydrateQuery(query))
      .map((query) => ({
        dehydratedAt: updatedAt,
        queryHash: query.queryHash,
        queryKey: query.queryKey,
        state: query.state,
        ...(query.meta ? { meta: query.meta } : {}),
      })),
  }
}
```

```js filename="app/lib/hydrate.js" switcher
import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query'

async function getHydrationUpdatedAt(tags) {
  'use cache'
  cacheTag(...tags)
  cacheLife('max')
  return Date.now()
}

export async function dehydrate(queries, options) {
  const updatedAt = await getHydrationUpdatedAt(options.tags)

  const queryClient = new QueryClient()

  for (const query of queries) {
    queryClient.setQueryData(query.queryKey, query.data, { updatedAt })
  }

  return {
    mutations: [],
    queries: queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => defaultShouldDehydrateQuery(query))
      .map((query) => ({
        dehydratedAt: updatedAt,
        queryHash: query.queryHash,
        queryKey: query.queryKey,
        state: query.state,
        ...(query.meta ? { meta: query.meta } : {}),
      })),
  }
}
```

Await the helper in the segment that owns the data, passing the data and the same tags used on the underlying `getProduct` read. Hand the result to `<HydrationBoundary>` inside `ProductData`:

```tsx filename="app/products/[id]/page.tsx" switcher
import { HydrationBoundary } from '@tanstack/react-query'
import { dehydrate } from '@/app/lib/hydrate'
import { getProduct } from './data'
import { productCache } from './product-cache'
import { ProductView } from './product-view'

async function ProductData({ id }: { id: string }) {
  const product = await getProduct(id)
  const state = await dehydrate(
    [{ queryKey: productCache.key(id), data: product }],
    { tags: [productCache.tag(id)] }
  )

  return (
    <HydrationBoundary state={state}>
      <ProductView id={id} />
    </HydrationBoundary>
  )
}
```

```jsx filename="app/products/[id]/page.js" switcher
import { HydrationBoundary } from '@tanstack/react-query'
import { dehydrate } from '@/app/lib/hydrate'
import { getProduct } from './data'
import { productCache } from './product-cache'
import { ProductView } from './product-view'

async function ProductData({ id }) {
  const product = await getProduct(id)
  const state = await dehydrate(
    [{ queryKey: productCache.key(id), data: product }],
    { tags: [productCache.tag(id)] }
  )

  return (
    <HydrationBoundary state={state}>
      <ProductView id={id} />
    </HydrationBoundary>
  )
}
```

> **Good to know:** The timestamp must advance whenever the hydrated data changes. The helper suits tag-driven server data because both use the same tags. For time-driven server data, derive the data and hydration timestamp from the same cached snapshot instead of maintaining unrelated time windows.

See the [live `next-spa-patterns` demo](https://next-spa-patterns.labs.vercel.dev/react-query) and its [source code](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/react-query). Learn more about [TanStack Query optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) and the [TanStack Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview).
