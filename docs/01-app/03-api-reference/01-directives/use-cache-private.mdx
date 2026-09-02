---
title: 'use cache: private'
description: 'Learn how to use the "use cache: private" directive to cache functions that access runtime request APIs.'
related:
  title: Related
  description: View related API references.
  links:
    - app/api-reference/directives/use-cache
    - app/api-reference/config/next-config-js/cacheComponents
    - app/api-reference/functions/cacheLife
    - app/api-reference/functions/cacheTag
---

The `'use cache: private'` directive allows functions to access runtime request APIs like `cookies()`, `headers()`, and `searchParams` within a cached scope. In production, matching calls within one request can reuse the same result, but Next.js does not store it in a server cache across requests.

The client router can keep the rendered output in browser memory for the [`stale` time](/docs/app/api-reference/functions/cacheLife#client-cache-behavior) configured with `cacheLife`. This client-side cache does not persist across page reloads.

Reach for `'use cache: private'` when:

- You want to cache a function that already accesses runtime data, and refactoring to [move the runtime access outside and pass values as arguments](/docs/app/getting-started/caching#working-with-runtime-apis) is not practical.
- You need request-specific data to be excluded from server caches that persist across production requests.

Private Cache Functions run at request time and are excluded from [static shell](/docs/app/getting-started/caching#prerendering) generation. To start a private Cache Function before a component needs its result, see [Preloading data](/docs/app/getting-started/fetching-data#preloading-data).

It is **not** possible to configure custom cache handlers for `'use cache: private'`.

For a comparison of the different cache directives, see [How `use cache: remote` differs from `use cache` and `use cache: private`](/docs/app/api-reference/directives/use-cache-remote#how-use-cache-remote-differs-from-use-cache-and-use-cache-private).

## Usage

To use `'use cache: private'`, enable the [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) flag in your `next.config.ts` file:

```tsx filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

```jsx filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
}

module.exports = nextConfig
```

Then add `'use cache: private'` to your function along with a `cacheLife` configuration.

### Basic example

In this example, we demonstrate that you can access cookies within a `'use cache: private'` scope:

```tsx filename="app/product/[id]/page.tsx" switcher
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

export async function generateStaticParams() {
  return [{ id: '1' }]
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div>
      <ProductDetails id={id} />
      <Suspense fallback={<div>Loading recommendations...</div>}>
        <Recommendations productId={id} />
      </Suspense>
    </div>
  )
}

async function Recommendations({ productId }: { productId: string }) {
  const recommendations = await getRecommendations(productId)

  return (
    <div>
      {recommendations.map((rec) => (
        <ProductCard key={rec.id} product={rec} />
      ))}
    </div>
  )
}

async function getRecommendations(productId: string) {
  'use cache: private'
  cacheTag(`recommendations-${productId}`)
  cacheLife({ stale: 60 })

  // Access cookies within private cache functions
  const sessionId = (await cookies()).get('session-id')?.value || 'guest'

  return getPersonalizedRecommendations(productId, sessionId)
}
```

```jsx filename="app/product/[id]/page.js" switcher
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

export async function generateStaticParams() {
  return [{ id: '1' }]
}

export default async function ProductPage({ params }) {
  const { id } = await params

  return (
    <div>
      <ProductDetails id={id} />
      <Suspense fallback={<div>Loading recommendations...</div>}>
        <Recommendations productId={id} />
      </Suspense>
    </div>
  )
}

async function Recommendations({ productId }) {
  const recommendations = await getRecommendations(productId)

  return (
    <div>
      {recommendations.map((rec) => (
        <ProductCard key={rec.id} product={rec} />
      ))}
    </div>
  )
}

async function getRecommendations(productId) {
  'use cache: private'
  cacheTag(`recommendations-${productId}`)
  cacheLife({ stale: 60 })

  // Access cookies within private cache functions
  const sessionId = (await cookies()).get('session-id')?.value || 'guest'

  return getPersonalizedRecommendations(productId, sessionId)
}
```

> **Good to know:** The `stale` time must be at least 30 seconds for per-link prefetching to work, and at least 5 minutes for the content to be included in the route's [App Shell](/docs/app/glossary#app-shell). See [`cacheLife` prerendering behavior](/docs/app/api-reference/functions/cacheLife#prerendering-behavior) for details.

### Configuring the client stale time

Private Cache Functions contribute their `stale` time to the route's [Client Cache](/docs/app/glossary#client-cache). If a function only needs request-scoped deduplication, use `cacheLife({ stale: Infinity })` to keep it from lowering the route's stale time.

Next.js uses the shortest stale time from the route's cache entries, so another cache or route setting can still set a finite value. Setting `stale` to `Infinity` does not store the private result on the server across production requests. Use a finite value when the client router should revalidate personalized output after a known interval.

## Request APIs allowed in private caches

The following request-specific APIs can be used inside `'use cache: private'` functions:

| API            | Allowed in `use cache` | Allowed in `'use cache: private'` |
| -------------- | ---------------------- | --------------------------------- |
| `cookies()`    | No                     | Yes                               |
| `headers()`    | No                     | Yes                               |
| `searchParams` | No                     | Yes                               |
| `connection()` | No                     | No                                |

> **Note:** The [`connection()`](https://nextjs.org/docs/app/api-reference/functions/connection) API is prohibited in both `use cache` and `'use cache: private'` as it provides connection-specific information that cannot be safely cached.

## Version History

| Version   | Changes                                                              |
| --------- | -------------------------------------------------------------------- |
| `v16.0.0` | `"use cache: private"` is enabled with the Cache Components feature. |
