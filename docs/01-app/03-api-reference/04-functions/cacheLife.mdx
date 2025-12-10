---
title: cacheLife
description: Learn how to use the cacheLife function to set the cache expiration time for a cached function or component.
related:
  title: Related
  description: View related API references.
  links:
    - app/api-reference/config/next-config-js/cacheComponents
    - app/api-reference/directives/use-cache
    - app/api-reference/functions/revalidateTag
    - app/api-reference/functions/cacheTag
---

The `cacheLife` function is used to set the cache lifetime of a function or component. It should be used alongside the [`use cache`](/docs/app/api-reference/directives/use-cache) directive, and within the scope of the function or component.

## Usage

### Basic setup

To use `cacheLife`, first enable the [`cacheComponents` flag](/docs/app/api-reference/config/next-config-js/cacheComponents) in your `next.config.js` file:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

```js filename="next.config.js" switcher
const nextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

`cacheLife` requires the `use cache` directive, which must be placed at the file level or at the top of an async function or component.

> **Good to know**:
>
> - If used, `cacheLife` should be placed within the function whose output is being cached, even when the `use cache` directive is at file level
> - Only one `cacheLife` call should execute per function invocation. You can call `cacheLife` in different control flow branches, but ensure only one executes per run. See the [conditional cache lifetimes](#conditional-cache-lifetimes) example

### Using preset profiles

Next.js provides preset cache profiles that cover common caching needs. Each profile balances three factors:

- How long users see cached content without checking for updates (client-side)
- How often fresh content is generated on the server
- When old content expires completely

Choose a profile based on how frequently your content changes:

- **`seconds`** - Real-time data (stock prices, live scores)
- **`minutes`** - Frequently updated (social feeds, news)
- **`hours`** - Multiple daily updates (product inventory, weather)
- **`days`** - Daily updates (blog posts, articles)
- **`weeks`** - Weekly updates (podcasts, newsletters)
- **`max`** - Rarely changes (legal pages, archived content)

Import `cacheLife` and pass a profile name:

```tsx filename="app/blog/page.tsx" highlight={1,5}
'use cache'
import { cacheLife } from 'next/cache'

export default async function BlogPage() {
  cacheLife('days') // Blog content updated daily

  const posts = await getBlogPosts()
  return <div>{/* render posts */}</div>
}
```

The profile name tells Next.js how to cache the entire function's output. If you don't call `cacheLife`, the `default` profile is used. See [preset cache profiles](#preset-cache-profiles) for timing details.

## Reference

### Cache profile properties

Cache profiles control caching behavior through three timing properties:

- **[`stale`](#stale)**: How long the client can use cached data without checking the server
- **[`revalidate`](#revalidate)**: After this time, the next request will trigger a background refresh
- **[`expire`](#expire)**: After this time with no requests, the next one waits for fresh content

#### `stale`

**Client-side:** How long the client can use cached data without checking the server.

During this time, the client-side router displays cached content immediately without any network request. After this period expires, the router must check with the server on the next navigation or request. This provides instant page loads from the client cache, but data may be outdated.

```tsx
cacheLife({ stale: 300 }) // 5 minutes
```

#### `revalidate`

How often the server regenerates cached content in the background.

- When a request arrives after this period, the server:
  1. Serves the cached version immediately (if available)
  2. Regenerates content in the background
  3. Updates the cache with fresh content
- Similar to [Incremental Static Regeneration (ISR)](/docs/app/guides/incremental-static-regeneration)

```tsx
cacheLife({ revalidate: 900 }) // 15 minutes
```

#### `expire`

Maximum time before the server must regenerate cached content.

- After this period with no traffic, the server regenerates content synchronously on the next request
- When you set both `revalidate` and `expire`, `expire` must be longer than `revalidate`. Next.js validates this and raises an error for invalid configurations.

```tsx
cacheLife({ expire: 3600 }) // 1 hour
```

### Preset cache profiles

If you don't specify a profile, Next.js uses the `default` profile. We recommend explicitly setting a profile to make caching behavior clear.

| **Profile** | **Use Case**                           | `stale`    | `revalidate` | `expire` |
| ----------- | -------------------------------------- | ---------- | ------------ | -------- |
| `default`   | Standard content                       | 5 minutes  | 15 minutes   | 1 year   |
| `seconds`   | Real-time data                         | 30 seconds | 1 second     | 1 minute |
| `minutes`   | Frequently updated content             | 5 minutes  | 1 minute     | 1 hour   |
| `hours`     | Content updated multiple times per day | 5 minutes  | 1 hour       | 1 day    |
| `days`      | Content updated daily                  | 5 minutes  | 1 day        | 1 week   |
| `weeks`     | Content updated weekly                 | 5 minutes  | 1 week       | 30 days  |
| `max`       | Stable content that rarely changes     | 5 minutes  | 30 days      | 1 year   |

### Custom cache profiles

Define reusable cache profiles in your `next.config.ts` file:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    biweekly: {
      stale: 60 * 60 * 24 * 14, // 14 days
      revalidate: 60 * 60 * 24, // 1 day
      expire: 60 * 60 * 24 * 14, // 14 days
    },
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    biweekly: {
      stale: 60 * 60 * 24 * 14, // 14 days
      revalidate: 60 * 60 * 24, // 1 day
      expire: 60 * 60 * 24 * 14, // 14 days
    },
  },
}

module.exports = nextConfig
```

The example above caches for 14 days, checks for updates daily, and expires the cache after 14 days. You can then reference this profile throughout your application by its name:

```tsx filename="app/page.tsx" highlight={5}
'use cache'
import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife('biweekly')
  return <div>Page</div>
}
```

### Overriding the default cache profiles

While the default cache profiles provide a useful way to think about how fresh or stale any given part of cacheable output can be, you may prefer different named profiles to better align with your applications caching strategies.

You can override the default named cache profiles by creating a new configuration with the same name as the defaults.

The example below shows how to override the default `"days"` cache profile:

```ts filename="next.config.ts"
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    // Override the 'days' profile
    days: {
      stale: 3600, // 1 hour
      revalidate: 900, // 15 minutes
      expire: 86400, // 1 day
    },
  },
}

export default nextConfig
```

### Inline cache profiles

For one-off cases, pass a profile object directly to `cacheLife`:

```tsx filename="app/page.tsx"
'use cache'
import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife({
    stale: 3600,
    revalidate: 900,
    expire: 86400,
  })

  return <div>Page</div>
}
```

Inline profiles apply only to the specific function or component. For reusable configurations, define custom profiles in `next.config.ts`.

Using `cacheLife({})` with an empty object applies the `default` profile values.

### Client router cache behavior

The `stale` property controls the client-side router cache, not the `Cache-Control` header:

- The server sends the stale time via the `x-nextjs-stale-time` response header
- The client router uses this value to determine when to revalidate
- **Minimum of 30 seconds is enforced** to ensure prefetched links remain usable

This 30-second minimum prevents prefetched data from expiring before users can click on links. It only applies to time-based expiration.

When you call revalidation functions from a Server Action ([`revalidateTag`](/docs/app/api-reference/functions/revalidateTag), [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath), [`updateTag`](/docs/app/api-reference/functions/updateTag), or [`refresh`](/docs/app/api-reference/functions/refresh)), the entire client cache is immediately cleared, bypassing the stale time.

> **Good to know**: The `stale` property in `cacheLife` differs from [`staleTimes`](/docs/app/api-reference/config/next-config-js/staleTimes). While `staleTimes` is a global setting affecting all routes, `cacheLife` allows per-function or per-route configuration. Updating `staleTimes.static` also updates the `stale` value of the `default` cache profile.

## Examples

### Using preset profiles

The simplest way to configure caching is using preset profiles. Choose one that matches your content's update pattern:

```tsx filename="app/blog/[slug]/page.tsx"
import { cacheLife } from 'next/cache'

export default async function BlogPost() {
  'use cache'
  cacheLife('days') // Blog posts updated daily

  const post = await fetchBlogPost()
  return <article>{post.content}</article>
}
```

```tsx filename="app/products/[id]/page.tsx"
import { cacheLife } from 'next/cache'

export default async function ProductPage() {
  'use cache'
  cacheLife('hours') // Product data updated multiple times per day

  const product = await fetchProduct()
  return <div>{product.name}</div>
}
```

### Custom profiles for specific needs

Define custom profiles when preset options don't match your requirements:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    editorial: {
      stale: 600, // 10 minutes
      revalidate: 3600, // 1 hour
      expire: 86400, // 1 day
    },
    marketing: {
      stale: 300, // 5 minutes
      revalidate: 1800, // 30 minutes
      expire: 43200, // 12 hours
    },
  },
}

export default nextConfig
```

Then use these profiles throughout your application:

```tsx filename="app/editorial/page.tsx"
import { cacheLife } from 'next/cache'

export default async function EditorialPage() {
  'use cache'
  cacheLife('editorial')
  // ...
}
```

### Inline profiles for unique cases

Use inline profiles when a specific function needs one-off caching behavior:

```tsx filename="app/api/limited-offer/route.ts"
import { cacheLife } from 'next/cache'
import { getDb } from '@lib/db'

async function getLimitedOffer() {
  'use cache'

  cacheLife({
    stale: 60, // 1 minute
    revalidate: 300, // 5 minutes
    expire: 3600, // 1 hour
  })

  const offer = await getDb().offer.findFirst({
    where: { type: 'limited' },
    orderBy: { created_at: 'desc' },
  })

  return offer
}

export async function GET() {
  const offer = await getLimitedOffer()

  return Response.json(offer)
}
```

### Caching individual functions

Apply caching to utility functions for granular control:

```tsx filename="lib/api.ts"
import { cacheLife } from 'next/cache'

export async function getSettings() {
  'use cache'
  cacheLife('max') // Settings rarely change

  return await fetchSettings()
}
```

```tsx filename="lib/stats.ts"
import { cacheLife } from 'next/cache'

export async function getRealtimeStats() {
  'use cache'
  cacheLife('seconds') // Stats update constantly

  return await fetchStats()
}
```

### Nested caching behavior

When you nest `use cache` directives (a cached function or component using another cached function or component), the outer cache's behavior depends on whether it has an explicit `cacheLife`.

#### With explicit outer cacheLife

The outer cache uses its own lifetime, regardless of inner cache lifetimes. When the outer cache hits, it returns the complete output including all nested data. An explicit `cacheLife` always takes precedence, whether it's longer or shorter than inner lifetimes.

```tsx filename="app/dashboard/page.tsx"
import { cacheLife } from 'next/cache'
import { Widget } from './widget'

export default async function Dashboard() {
  'use cache'
  cacheLife('hours') // Outer scope sets its own lifetime

  return (
    <div>
      <h1>Dashboard</h1>
      <Widget /> {/* Inner scope has 'minutes' lifetime */}
    </div>
  )
}
```

#### Without explicit outer cacheLife

If you don't call `cacheLife` in the outer cache, it uses the `default` profile (15 min revalidate). Inner caches with shorter lifetimes can reduce the outer cache's `default` lifetime. Inner caches with longer lifetimes cannot extend it beyond the default.

```tsx filename="app/dashboard/page.tsx"
import { Widget } from './widget'

export default async function Dashboard() {
  'use cache'
  // No cacheLife call - uses default (15 min)
  // If Widget has 5 min → Dashboard becomes 5 min
  // If Widget has 1 hour → Dashboard stays 15 min

  return (
    <div>
      <h1>Dashboard</h1>
      <Widget />
    </div>
  )
}
```

**It is recommended to specify an explicit `cacheLife`.** With explicit lifetime values, you can inspect a cached function or component and immediately know its behavior without tracing through nested caches. Without explicit lifetime values, the behavior becomes dependent on inner cache lifetimes, making it harder to reason about.

### Conditional cache lifetimes

You can call `cacheLife` conditionally in different code paths to set different cache durations based on your application logic:

```tsx filename="lib/posts.ts" highlight={14,19}
import { cacheLife, cacheTag } from 'next/cache'

async function getPostContent(slug: string) {
  'use cache'

  const post = await fetchPost(slug)

  // Tag the cache entry for targeted revalidation
  cacheTag(`post-${slug}`)

  if (!post) {
    // Content may not be published yet or could be in draft
    // Cache briefly to reduce database load
    cacheLife('minutes')
    return null
  }

  // Published content can be cached longer
  cacheLife('days')

  // Return only the necessary data to keep cache size minimal
  return post.data
}
```

This pattern is useful when different outcomes need different cache durations, for example, when an item is missing but is likely to be available later.

#### Using dynamic cache lifetimes from data

If you want to calculate cache lifetime at runtime, for example by reading it from the fetched data, use an [inline cache profile](#inline-cache-profiles) object:

```tsx filename="lib/posts.ts" highlight={15,16,17}
import { cacheLife, cacheTag } from 'next/cache'

async function getPostContent(slug: string) {
  'use cache'

  const post = await fetchPost(slug)
  cacheTag(`post-${slug}`)

  if (!post) {
    cacheLife('minutes')
    return null
  }

  // Use cache timing from CMS data directly as an object
  cacheLife({
    // Ensure post.revalidateSeconds is a number in seconds
    revalidate: post.revalidateSeconds ?? 3600,
  })

  return post.data
}
```
