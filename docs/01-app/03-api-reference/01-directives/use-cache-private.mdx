---
title: 'use cache: private'
description: 'Learn how to use the `"use cache: private"` directive to enable runtime prefetching of personalized content in your Next.js application.'
related:
  title: Related
  description: View related API references.
  links:
    - app/api-reference/directives/use-cache
    - app/api-reference/config/next-config-js/cacheComponents
    - app/api-reference/config/next-config-js/cacheHandlers
    - app/api-reference/functions/cacheLife
    - app/api-reference/functions/cacheTag
    - app/guides/prefetching
---

The `'use cache: private'` directive works just like [`use cache`](/docs/app/api-reference/directives/use-cache), but allows you to use runtime APIs like cookies, headers, or search params.

> **Good to know:** Unlike `use cache`, private caches are not prerendered statically as they contain personalized data that is not shared between users.

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

export default nextConfig
```

Then add `'use cache: private'` to your function along with a `cacheLife` configuration.

### Basic example

```tsx filename="app/product/[id]/page.tsx" switcher
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

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
  cacheLife({ stale: 60 }) // Minimum 30 seconds required for runtime prefetch

  // Access cookies within private cache functions
  const sessionId = (await cookies()).get('session-id')?.value || 'guest'

  return getPersonalizedRecommendations(productId, sessionId)
}
```

```jsx filename="app/product/[id]/page.js" switcher
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

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
  cacheLife({ stale: 60 }) // Minimum 30 seconds required for runtime prefetch

  // Access cookies within private cache functions
  const sessionId = (await cookies()).get('session-id')?.value || 'guest'

  return getPersonalizedRecommendations(productId, sessionId)
}
```

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
