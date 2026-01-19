---
title: 'use cache: remote'
description: 'Learn how to use the "use cache: remote" directive for persistent, shared caching using remote cache handlers.'
related:
  title: Related
  description: View related API references.
  links:
    - app/api-reference/directives/use-cache
    - app/api-reference/directives/use-cache-private
    - app/api-reference/config/next-config-js/cacheComponents
    - app/api-reference/config/next-config-js/cacheHandlers
    - app/api-reference/functions/cacheLife
    - app/api-reference/functions/cacheTag
    - app/api-reference/functions/connection
---

While the `use cache` directive is sufficient for most application needs, you might occasionally notice that cached operations are re-running more often than expected, or that your upstream services (CMS, databases, external APIs) are getting more hits than you'd expect. This can happen because in-memory caching has inherent limitations:

- Cache entries being evicted to make room for new ones
- Memory constraints in your deployment environment
- Cache not persisting across requests or server restarts

Note that `use cache` still provides value beyond server-side caching: it informs Next.js what can be prefetched and defines stale times for client-side navigation.

The `'use cache: remote'` directive lets you declaratively specify that a cached output should be stored in a **remote cache** instead of in-memory. While this gives you more durable caching for specific operations, it comes with tradeoffs: infrastructure cost and network latency during cache lookups.

## Usage

To use `'use cache: remote'`, enable the [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) flag in your `next.config.ts` file:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

Then add `'use cache: remote'` to the functions or components where you've determined remote caching is justified. The handler implementation is configured via [`cacheHandlers`](/docs/app/api-reference/config/next-config-js/cacheHandlers), though hosting providers should typically provide this automatically. If you're self-hosting, see the `cacheHandlers` configuration reference to set up your cache storage.

### When to avoid remote caching

- If you already have a server-side cache key-value store wrapping your data layer, `use cache` may be sufficient to include data in the static shell without adding another caching layer
- If operations are already fast (< 50ms) due to proximity or local access, the remote cache lookup might not improve performance
- If cache keys have mostly unique values per request (search filters, price ranges, user-specific parameters), cache utilization will be near-zero
- If data changes frequently (seconds to minutes), cache hits will quickly go stale, leading to frequent misses and waiting for upstream revalidation

### When remote caching makes sense

Remote caching provides the most value when content is deferred to request time (outside the static shell). This typically happens when a component accesses request values like [`cookies()`](/docs/app/api-reference/functions/cookies), [`headers()`](/docs/app/api-reference/functions/headers), or [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional), placing it inside a Suspense boundary. In this context:

- Each request executes the component and looks up the cache
- In serverless environments, each instance has its own ephemeral memory with low cache hit rates
- Remote caching provides a shared cache across all instances, improving hit rates and reducing backend load

Compelling scenarios for `'use cache: remote'`:

- **Rate-limited APIs**: Your upstream service has rate limits or request quotas that you risk hitting
- **Protecting slow backends**: Your database or API becomes a bottleneck under high traffic
- **Expensive operations**: Database queries or computations that are costly to run repeatedly
- **Flaky or unreliable services**: External services that occasionally fail or have availability issues

In these cases, the cost and latency of remote caching is justified by avoiding worse outcomes (rate limit errors, backend overload, high compute bills, or degraded user experience).

For static shell content, `use cache` is usually sufficient. However, if your static pages share data from an upstream that can't handle concurrent revalidation requests (like a rate-limited CMS), `use cache: remote` acts as a shared cache layer in front of that upstream. This is the same pattern as putting a key-value store in front of a database, but declared in your code rather than configured in infrastructure.

### How `use cache: remote` differs from `use cache` and `use cache: private`

Next.js provides three caching directives, each designed for different use cases:

| Feature                                 | `use cache`                     | `'use cache: remote'`             | `'use cache: private'` |
| --------------------------------------- | ------------------------------- | --------------------------------- | ---------------------- |
| **Server-side caching**                 | In-memory or cache handler      | Remote cache handler              | None                   |
| **Cache scope**                         | Shared across all users         | Shared across all users           | Per-client (browser)   |
| **Can access cookies/headers directly** | No (must pass as arguments)     | No (must pass as arguments)       | Yes                    |
| **Server cache utilization**            | May be low outside static shell | High (shared across instances)    | N/A                    |
| **Additional costs**                    | None                            | Infrastructure (storage, network) | None                   |
| **Latency impact**                      | None                            | Cache handler lookup              | None                   |

### Caching with runtime data

Both `use cache` and `'use cache: remote'` directives can't access runtime data like cookies or search params directly, since this data isn't available when computing the cache. However, you can extract values from these APIs and pass them as arguments to cached functions. See [with runtime data](/docs/app/getting-started/cache-components#with-runtime-data) for this pattern.

In general, but most importantly for `'use cache: remote'`, be thoughtful about which values you include in cache keys. Each unique value creates a separate cache entry, reducing cache utilization. Consider this example with search filters:

```tsx filename="app/products/[category]/page.tsx"
import { Suspense } from 'react'

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<{ minPrice?: string }>
}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProductList params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function ProductList({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<{ minPrice?: string }>
}) {
  const { category } = await params

  const { minPrice } = await searchParams

  // Cache only on category (few unique values)
  // Don't include price filter (many unique values)
  const products = await getProductsByCategory(category)

  // Filter price in memory instead of creating cache entries
  // for every price value
  const filtered = minPrice
    ? products.filter((p) => p.price >= parseFloat(minPrice))
    : products

  return <div>{/* render filtered products */}</div>
}

async function getProductsByCategory(category: string) {
  'use cache: remote'
  // Only category is part of the cache key
  // Much better utilization than caching every price filter value
  return db.products.findByCategory(category)
}
```

In this example, the remote handler stores more data per cache entry (all products in a category) to achieve better cache hit rates. This is worth it when the cost of cache misses (hitting your backend) outweighs the storage cost of larger entries.

The same principle applies to user-specific data. Rather than caching per-user data directly, use user preferences to determine what shared data to cache.

For example, if users have a language preference in their session, extract that preference and use it to cache shared content:

- Instead of remote caching `getUserProfile(sessionID)`, which creates one entry per user
- Remote cache `getCMSContent(language)` to create one entry per language

```tsx filename="app/components/welcome-message.tsx"
import { cookies } from 'next/headers'
import { cacheLife } from 'next/cache'

export async function WelcomeMessage() {
  // Extract the language preference (not unique per user)
  const language = (await cookies()).get('language')?.value || 'en'

  // Cache based on language (few unique values: en, es, fr, de, etc.)
  // All users who prefer 'en' share the same cache entry
  const content = await getCMSContent(language)

  return <div>{content.welcomeMessage}</div>
}

async function getCMSContent(language: string) {
  'use cache: remote'
  cacheLife({ expire: 3600 })
  // Creates ~10-50 cache entries (one per language)
  // instead of thousands (one per user)
  return cms.getHomeContent(language)
}
```

This way all users who prefer the same language share a cache entry, improving cache utilization and reducing load on your CMS.

The pattern is the same in both examples: find the dimension with fewer unique values (category vs. price, language vs. user ID), cache on that dimension, and filter or select the rest in memory.

If the service used by `getUserProfile` cannot scale with your frontend load, you may still be able to use the `use cache` directive with a short `cacheLife` for in-memory caching. However, for most user data, you likely want to fetch directly from the source (which might already be wrapped in a key/value store as mentioned in the guidelines above).

Only use [`'use cache: private'`](/docs/app/api-reference/directives/use-cache-private) if you have compliance requirements or can't refactor to pass runtime data as arguments.

### Nesting rules

Remote caches have specific nesting rules:

- Remote caches **can** be nested inside other remote caches (`'use cache: remote'`)
- Remote caches **can** be nested inside regular caches (`'use cache'`)
- Remote caches **cannot** be nested inside private caches (`'use cache: private'`)
- Private caches **cannot** be nested inside remote caches

```tsx
// VALID: Remote inside remote
async function outerRemote() {
  'use cache: remote'
  const result = await innerRemote()
  return result
}

async function innerRemote() {
  'use cache: remote'
  return getData()
}

// VALID: Remote inside regular cache
async function outerCache() {
  'use cache'
  // The inner remote cache will work when deferred to request time
  const result = await innerRemote()
  return result
}

async function innerRemote() {
  'use cache: remote'
  return getData()
}

// INVALID: Remote inside private
async function outerPrivate() {
  'use cache: private'
  const result = await innerRemote() // Error!
  return result
}

async function innerRemote() {
  'use cache: remote'
  return getData()
}

// INVALID: Private inside remote
async function outerRemote() {
  'use cache: remote'
  const result = await innerPrivate() // Error!
  return result
}

async function innerPrivate() {
  'use cache: private'
  return getData()
}
```

## Examples

The following examples demonstrate common patterns for using `'use cache: remote'`. For details about `cacheLife` parameters (`stale`, `revalidate`, `expire`), see the [`cacheLife` API reference](/docs/app/api-reference/functions/cacheLife).

### With user preferences

Cache product pricing based on the user's currency preference. Since the currency is stored in a cookie, this component renders at request time. Remote caching is valuable here because all users with the same currency share the cached price, and in serverless environments, all instances share the same remote cache.

```tsx filename="app/product/[id]/page.tsx" switcher
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheTag, cacheLife } from 'next/cache'

export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
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
      <Suspense fallback={<div>Loading price...</div>}>
        <ProductPrice productId={id} />
      </Suspense>
    </div>
  )
}

function ProductDetails({ id }: { id: string }) {
  return <div>Product: {id}</div>
}

async function ProductPrice({ productId }: { productId: string }) {
  // Reading cookies defers this component to request time
  const currency = (await cookies()).get('currency')?.value ?? 'USD'

  // Cache the price per product and currency combination
  // All users with the same currency share this cache entry
  const price = await getProductPrice(productId, currency)

  return (
    <div>
      Price: {price} {currency}
    </div>
  )
}

async function getProductPrice(productId: string, currency: string) {
  'use cache: remote'
  cacheTag(`product-price-${productId}`)
  cacheLife({ expire: 3600 }) // 1 hour

  // Cached per (productId, currency) - few currencies means high cache utilization
  return db.products.getPrice(productId, currency)
}
```

```jsx filename="app/product/[id]/page.js" switcher
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheTag, cacheLife } from 'next/cache'

export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}

export default async function ProductPage({ params }) {
  const { id } = await params

  return (
    <div>
      <ProductDetails id={id} />
      <Suspense fallback={<div>Loading price...</div>}>
        <ProductPrice productId={id} />
      </Suspense>
    </div>
  )
}

function ProductDetails({ id }) {
  return <div>Product: {id}</div>
}

async function ProductPrice({ productId }) {
  // Reading cookies defers this component to request time
  const currency = (await cookies()).get('currency')?.value ?? 'USD'

  // Cache the price per product and currency combination
  // All users with the same currency share this cache entry
  const price = await getProductPrice(productId, currency)

  return (
    <div>
      Price: {price} {currency}
    </div>
  )
}

async function getProductPrice(productId, currency) {
  'use cache: remote'
  cacheTag(`product-price-${productId}`)
  cacheLife({ expire: 3600 }) // 1 hour

  // Cached per (productId, currency) - few currencies means high cache utilization
  return db.products.getPrice(productId, currency)
}
```

### Reducing database load

Cache expensive database queries, reducing load on your database. In this example, we don't access `cookies()`, `headers()`, or `searchParams`. If we had a requirement to not include these stats in the static shell, we could use [`connection()`](/docs/app/api-reference/functions/connection) to explicitly defer to request time:

```tsx filename="app/dashboard/page.tsx"
import { Suspense } from 'react'
import { connection } from 'next/server'
import { cacheLife, cacheTag } from 'next/cache'

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading stats...</div>}>
      <DashboardStats />
    </Suspense>
  )
}

async function DashboardStats() {
  // Defer to request time
  await connection()

  const stats = await getGlobalStats()

  return <StatsDisplay stats={stats} />
}

async function getGlobalStats() {
  'use cache: remote'
  cacheTag('global-stats')
  cacheLife({ expire: 60 }) // 1 minute

  // This expensive database query is cached and shared across all users,
  // reducing load on your database
  const stats = await db.analytics.aggregate({
    total_users: 'count',
    active_sessions: 'count',
    revenue: 'sum',
  })

  return stats
}
```

With this setup, your upstream database sees at most one request per minute, regardless of how many users visit the dashboard.

### API responses in streaming contexts

Cache API responses that are fetched during streaming or after dynamic operations:

```tsx filename="app/feed/page.tsx"
import { Suspense } from 'react'
import { connection } from 'next/server'
import { cacheLife, cacheTag } from 'next/cache'

export default async function FeedPage() {
  return (
    <div>
      <Suspense fallback={<Skeleton />}>
        <FeedItems />
      </Suspense>
    </div>
  )
}

async function FeedItems() {
  // Defer to request time
  await connection()

  const items = await getFeedItems()

  return items.map((item) => <FeedItem key={item.id} item={item} />)
}

async function getFeedItems() {
  'use cache: remote'
  cacheTag('feed-items')
  cacheLife({ expire: 120 }) // 2 minutes

  // This API call is cached, reducing requests to your external service
  const response = await fetch('https://api.example.com/feed')
  return response.json()
}
```

### Computed data after dynamic checks

Cache expensive computations that occur after dynamic security or feature checks:

```tsx filename="app/reports/page.tsx"
import { connection } from 'next/server'
import { cacheLife } from 'next/cache'

export default async function ReportsPage() {
  // Defer to request time (for security check)
  await connection()

  const report = await generateReport()

  return <ReportViewer report={report} />
}

async function generateReport() {
  'use cache: remote'
  cacheLife({ expire: 3600 }) // 1 hour

  // This expensive computation is cached and shared across all authorized users,
  // avoiding repeated calculations
  const data = await db.transactions.findMany()

  return {
    totalRevenue: calculateRevenue(data),
    topProducts: analyzeProducts(data),
    trends: calculateTrends(data),
  }
}
```

### Mixed caching strategies

Combine static, remote, and private caching for optimal performance:

```tsx filename="app/product/[id]/page.tsx"
import { Suspense } from 'react'
import { connection } from 'next/server'
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

// Static product data - prerendered at build time
async function getProduct(id: string) {
  'use cache'
  cacheTag(`product-${id}`)

  // This is cached at build time and shared across all users
  return db.products.find({ where: { id } })
}

// Shared pricing data - cached at runtime in remote handler
async function getProductPrice(id: string) {
  'use cache: remote'
  cacheTag(`product-price-${id}`)
  cacheLife({ expire: 300 }) // 5 minutes

  // This is cached at runtime and shared across all users
  return db.products.getPrice({ where: { id } })
}

// User-specific recommendations - private cache per user
async function getRecommendations(productId: string) {
  'use cache: private'
  cacheLife({ expire: 60 }) // 1 minute

  const sessionId = (await cookies()).get('session-id')?.value

  // This is cached per-user and never shared
  return db.recommendations.findMany({
    where: { productId, sessionId },
  })
}

export default async function ProductPage({ params }) {
  const { id } = await params

  // Static product data
  const product = await getProduct(id)

  return (
    <div>
      <ProductDetails product={product} />

      {/* Dynamic shared price */}
      <Suspense fallback={<PriceSkeleton />}>
        <ProductPriceComponent productId={id} />
      </Suspense>

      {/* Dynamic personalized recommendations */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <ProductRecommendations productId={id} />
      </Suspense>
    </div>
  )
}

function ProductDetails({ product }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
    </div>
  )
}

async function ProductPriceComponent({ productId }) {
  // Defer to request time
  await connection()

  const price = await getProductPrice(productId)
  return <div>Price: ${price}</div>
}

async function ProductRecommendations({ productId }) {
  const recommendations = await getRecommendations(productId)
  return <RecommendationsList items={recommendations} />
}

function PriceSkeleton() {
  return <div>Loading price...</div>
}

function RecommendationsSkeleton() {
  return <div>Loading recommendations...</div>
}

function RecommendationsList({ items }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  )
}
```

> **Good to know**:
>
> - Remote caches are stored in server-side cache handlers and shared across all users
> - `'use cache: remote'` works outside the static shell where [`use cache`](/docs/app/api-reference/directives/use-cache) may not provide server-side cache hits
> - Use [`cacheTag()`](/docs/app/api-reference/functions/cacheTag) and [`revalidateTag()`](/docs/app/api-reference/functions/revalidateTag) to invalidate remote caches on-demand
> - Use [`cacheLife()`](/docs/app/api-reference/functions/cacheLife) to configure cache expiration
> - For user-specific data, use [`'use cache: private'`](/docs/app/api-reference/directives/use-cache-private) instead of `'use cache: remote'`
> - Remote caches reduce origin load by storing computed or fetched data server-side

## Platform Support

| Deployment Option                                                   | Supported |
| ------------------------------------------------------------------- | --------- |
| [Node.js server](/docs/app/getting-started/deploying#nodejs-server) | Yes       |
| [Docker container](/docs/app/getting-started/deploying#docker)      | Yes       |
| [Static export](/docs/app/getting-started/deploying#static-export)  | No        |
| [Adapters](/docs/app/getting-started/deploying#adapters)            | Yes       |

## Version History

| Version   | Changes                                                             |
| --------- | ------------------------------------------------------------------- |
| `v16.0.0` | `"use cache: remote"` is enabled with the Cache Components feature. |
