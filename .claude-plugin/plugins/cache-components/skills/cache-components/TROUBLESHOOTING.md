# Cache Components Troubleshooting

Common issues, debugging techniques, and solutions for Cache Components.

## Build-Time Feedback Philosophy

Cache Components introduces **early feedback** during development. Unlike before where errors might only appear in production, Cache Components produces build errors that **guide you toward optimal patterns**.

Key principle: **If it builds, it's correct.** The build process validates that:

- Dynamic data isn't accessed outside Suspense boundaries
- Cached data doesn't depend on request-specific APIs
- `generateStaticParams` provides valid parameters to test rendering

---

## Quick Debugging Checklist

Copy this checklist when debugging cache issues:

### Cache Not Working

- [ ] `cacheComponents: true` in next.config?
- [ ] Function is `async`?
- [ ] `'use cache'` is FIRST statement in function body?
- [ ] All arguments are serializable (no functions, class instances)?
- [ ] Not accessing `cookies()`/`headers()` inside cache?

### Stale Data After Mutation

- [ ] Called `updateTag()` or `revalidateTag()` after mutation?
- [ ] Tag in invalidation matches tag in `cacheTag()`?
- [ ] Using `updateTag()` (not `revalidateTag()`) for immediate updates?

### Build Errors

- [ ] Dynamic data wrapped in `<Suspense>`?
- [ ] `generateStaticParams` returns at least one param?
- [ ] Not mixing `'use cache'` with `cookies()`/`headers()`?

### Performance Issues

- [ ] Cache granularity appropriate? (not too coarse/fine)
- [ ] `cacheLife` set appropriately for data volatility?
- [ ] Using hierarchical tags for targeted invalidation?

---

## Error: UseCacheTimeoutError

### Symptoms

```
Error: A component used 'use cache' but didn't complete within 50 seconds.
```

### Cause

The cached function is accessing request-specific data (cookies, headers, searchParams) or making requests that depend on runtime context.

### Solution

User-specific content that depends on runtime data (cookies, headers, searchParams) should **not be cached**. Instead, stream it dynamically:

```tsx
// ❌ WRONG: Trying to cache user-specific content
async function UserContent() {
  'use cache'
  const session = await cookies() // Causes timeout!
  return await fetchContent(session.userId)
}

// ✅ CORRECT: Don't cache user-specific content, stream it instead
async function UserContent() {
  const session = await cookies()
  return await fetchContent(session.get('userId')?.value)
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <UserContent /> {/* No 'use cache' - streams dynamically */}
    </Suspense>
  )
}
```

**Key insight**: Cache Components are for content that can be shared across users (e.g., product details, blog posts). User-specific content should stream at request time.

---

## Error: Cannot use 'use cache' with sync function

### Symptoms

```
Error: 'use cache' can only be used in async functions
```

### Cause

Cache Components require async functions because cached outputs are streamed.

### Solution

```tsx
// ❌ WRONG: Synchronous function
function CachedComponent() {
  'use cache'
  return <div>Hello</div>
}

// ✅ CORRECT: Async function
async function CachedComponent() {
  'use cache'
  return <div>Hello</div>
}
```

---

## Error: Dynamic Data Outside Suspense

### Symptoms

```
Error: Accessing cookies/headers/searchParams outside a Suspense boundary
```

### Cause

With Cache Components, accessing request-specific APIs (cookies, headers, searchParams, connection) requires a Suspense boundary so Next.js can provide a static fallback.

### Why This Changed

**Before Cache Components**: The page silently became fully dynamic - no static content served.

**After Cache Components**: Build error ensures you explicitly handle the dynamic boundary.

### Solution

Wrap dynamic content in Suspense:

```tsx
// ❌ ERROR: No Suspense boundary
export default async function Page() {
  return (
    <>
      <Header />
      <UserDeals /> {/* Uses cookies() */}
    </>
  )
}

// ✅ CORRECT: Suspense provides static fallback
export default async function Page() {
  return (
    <>
      <Header />
      <Suspense fallback={<DealsSkeleton />}>
        <UserDeals />
      </Suspense>
    </>
  )
}
```

> **See also**: Pattern 1 (Static + Cached + Dynamic Page) in PATTERNS.md shows the foundational Suspense boundary pattern.

---

## Error: Uncached Data Outside Suspense

### Symptoms

```
Error: Accessing uncached data outside Suspense
```

### Cause

With Cache Components, ALL **async** I/O is considered dynamic by default. Database queries, fetch calls, and file reads must either be cached or wrapped in Suspense.

> **Note on synchronous databases**: Libraries with synchronous APIs (e.g., `better-sqlite3`) don't trigger this error because they don't involve async I/O. Synchronous operations complete during render and are included in the static shell. However, this also means they block the render thread - use judiciously for small, fast queries only.

### Solution

Either cache the data or wrap in Suspense:

```tsx
// ❌ ERROR: Uncached database query without Suspense
export default async function ProductPage({ params }) {
  const product = await db.products.findUnique({ where: { id: params.id } })
  return <ProductCard product={product} />
}

// ✅ OPTION 1: Cache the data
async function getProduct(id: string) {
  'use cache'
  cacheTag(`product-${id}`)
  cacheLife('hours')

  return await db.products.findUnique({ where: { id } })
}

export default async function ProductPage({ params }) {
  const product = await getProduct(params.id)
  return <ProductCard product={product} />
}

// ✅ OPTION 2: Wrap in Suspense (streams dynamically)
export default async function ProductPage({ params }) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent id={params.id} />
    </Suspense>
  )
}
```

> **See also**: Pattern 5 (Cached Data Fetching Functions) in PATTERNS.md shows reusable cached data fetcher patterns.

---

## Error: Empty generateStaticParams

### Symptoms

```
Error: generateStaticParams must return at least one parameter set
```

### Cause

With Cache Components, empty `generateStaticParams` is no longer allowed. This prevents a class of bugs where dynamic API usage in components would only error in production.

### Why This Changed

**Before**: Empty array = "trust me, this is static". Dynamic API usage in production caused runtime errors.

**After**: Must provide at least one param set so Next.js can validate the page actually renders statically.

### Solution

```tsx
// ❌ ERROR: Empty array
export function generateStaticParams() {
  return []
}

// ✅ CORRECT: Provide at least one param
export async function generateStaticParams() {
  const products = await getPopularProducts()
  return products.map(({ category, slug }) => ({ category, slug }))
}

// ✅ ALSO CORRECT: Hardcoded for known routes
export function generateStaticParams() {
  return [{ slug: 'about' }, { slug: 'contact' }, { slug: 'pricing' }]
}
```

---

## Error: Request Data Inside Cache

### Symptoms

```
Error: Cannot access cookies/headers inside 'use cache'
```

### Cause

Cache contexts cannot depend on request-specific data because the cached result would be shared across all users.

### Solution

User-specific content should **not be cached**. Remove `'use cache'` and stream the content dynamically:

```tsx
// ❌ ERROR: Cookies inside cache
async function UserDashboard() {
  'use cache'
  const session = await cookies() // Error!
  return await fetchDashboard(session.get('userId'))
}

// ✅ CORRECT: Don't cache user-specific content
async function UserDashboard() {
  const session = await cookies()
  return await fetchDashboard(session.get('userId')?.value)
}

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <UserDashboard /> {/* Streams at request time */}
    </Suspense>
  )
}
```

**Key insight**: Cache Components are for content that can be shared across users. User-specific dashboards should stream dynamically.

---

## Issue: Cache Not Being Used

### Symptoms

- Data always fresh on every request
- No caching behavior observed
- Build logs don't show cached routes

### Checklist

**1. Is `cacheComponents` enabled?**

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true, // Required!
}
```

**2. Is the function async?**

```tsx
// Must be async
async function CachedData() {
  'use cache'
  return await fetchData()
}
```

**3. Is `'use cache'` the first statement?**

```tsx
// ❌ WRONG: Directive not first
async function CachedData() {
  const x = 1 // Something before 'use cache'
  ;('use cache')
  return await fetchData()
}

// ✅ CORRECT: Directive first
async function CachedData() {
  'use cache'
  const x = 1
  return await fetchData()
}
```

**4. Are arguments serializable?**

```tsx
// ❌ WRONG: Function as argument (not serializable)
async function CachedData({ transform }: { transform: (x: any) => any }) {
  'use cache'
  const data = await fetchData()
  return transform(data)
}

// ✅ CORRECT: Only serializable arguments
async function CachedData({ transformType }: { transformType: string }) {
  'use cache'
  const data = await fetchData()
  return applyTransform(data, transformType)
}
```

---

## Issue: Stale Data After Mutation

### Symptoms

- Created/updated data doesn't appear immediately
- Need to refresh page to see changes

### Cause

Cache not invalidated after mutation.

### Solutions

**1. Use `updateTag()` for immediate consistency:**

```tsx
'use server'
import { updateTag } from 'next/cache'

export async function createPost(data: FormData) {
  await db.posts.create({ data })
  updateTag('posts') // Immediate invalidation
}
```

**2. Ensure tags match:**

```tsx
// Cache uses this tag
async function Posts() {
  'use cache'
  cacheTag('posts') // Must match invalidation tag
  return await db.posts.findMany()
}

// Invalidation must use same tag
export async function createPost(data: FormData) {
  await db.posts.create({ data })
  updateTag('posts') // Same tag!
}
```

**3. Invalidate all relevant tags:**

```tsx
export async function updatePost(postId: string, data: FormData) {
  const post = await db.posts.update({
    where: { id: postId },
    data,
  })

  // Invalidate all affected caches
  updateTag('posts') // All posts list
  updateTag(`post-${postId}`) // Specific post
  updateTag(`author-${post.authorId}`) // Author's posts
}
```

---

## Issue: Different Cache Values for Same Key

### Symptoms

- Cache returns different values for what should be the same query
- Inconsistent behavior across requests

### Cause

Arguments are part of cache key. Different argument values = different cache entries.

### Solution

Normalize arguments:

```tsx
// ❌ Problem: Object reference differs
async function CachedData({ options }: { options: { limit: number } }) {
  'use cache'
  return await fetchData(options)
}

// Each call creates new object = new cache key
<CachedData options={{ limit: 10 }} />
<CachedData options={{ limit: 10 }} /> // Different cache entry!

// ✅ Solution: Use primitives or stable references
async function CachedData({ limit }: { limit: number }) {
  'use cache'
  return await fetchData({ limit })
}

<CachedData limit={10} />
<CachedData limit={10} /> // Same cache entry!
```

---

## Issue: Cache Too Aggressive (Stale Data)

### Symptoms

- Data doesn't update when expected
- Users see outdated content

### Solutions

**1. Reduce cache lifetime:**

```tsx
async function FrequentlyUpdatedData() {
  'use cache'
  cacheLife('seconds') // Short cache

  // Or custom short duration
  cacheLife({
    stale: 0,
    revalidate: 30,
    expire: 60,
  })

  return await fetchData()
}
```

**2. Don't cache volatile data:**

```tsx
// For truly real-time data, skip caching
async function LiveData() {
  // No 'use cache'
  return await fetchLiveData()
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <LiveData />
    </Suspense>
  )
}
```

---

## Issue: Build Takes Too Long

### Symptoms

- Build hangs during prerendering
- Timeout errors during `next build`

### Cause

Cached functions making slow network requests or accessing unavailable services during build.

### Solutions

**1. Use fallback data for build:**

```tsx
async function CachedData() {
  'use cache'

  try {
    return await fetchFromAPI()
  } catch (error) {
    // Return fallback during build if API unavailable
    return getFallbackData()
  }
}
```

**2. Limit static generation scope:**

```tsx
// app/[slug]/page.tsx
export function generateStaticParams() {
  // Only prerender most important pages at build time
  // Other pages will be generated on-demand at request time
  return [{ slug: 'home' }, { slug: 'about' }]
}
```

**3. Use Suspense for truly dynamic content:**

```tsx
// app/[slug]/page.tsx
import { Suspense } from 'react'

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DynamicContent params={params} />
    </Suspense>
  )
}
```

> **Note:** Avoid using `export const dynamic = 'force-dynamic'` as this segment config is deprecated with Cache Components. Use Suspense boundaries and `'use cache'` for granular control instead.

---

## Debugging Techniques

### 1. Check Cache Headers

In development, inspect response headers:

```bash
curl -I http://localhost:3000/your-page
```

Look for:

- `x-nextjs-cache: HIT` - Served from cache
- `x-nextjs-cache: MISS` - Cache miss, recomputed
- `x-nextjs-cache: STALE` - Stale content, revalidating

### 2. Enable Verbose Logging

```bash
# Environment variable for cache debugging
NEXT_PRIVATE_DEBUG_CACHE=1 npm run dev
```

### 3. Check Build Output

```bash
npm run build

# Look for:
# ○ (Static) - Fully static
# ◐ (Partial) - Partial prerender with cache
# λ (Dynamic) - Server-rendered
```

### 4. Inspect Cache Tags

Add logging to verify tags:

```tsx
async function CachedData({ id }: { id: string }) {
  'use cache'

  const tags = ['data', `item-${id}`]
  console.log('Cache tags:', tags) // Check during build

  tags.forEach((tag) => cacheTag(tag))
  cacheLife('hours')

  return await fetchData(id)
}
```

---

## Common Mistakes Checklist

| Mistake                            | Symptom            | Fix                   |
| ---------------------------------- | ------------------ | --------------------- |
| Missing `cacheComponents: true`    | No caching         | Add to next.config.ts |
| Sync function with `'use cache'`   | Build error        | Make function async   |
| `'use cache'` not first statement  | Cache ignored      | Move to first line    |
| Accessing cookies/headers in cache | Timeout error      | Extract to wrapper    |
| Non-serializable arguments         | Inconsistent cache | Use primitives        |
| Missing Suspense for dynamic       | Streaming broken   | Wrap in Suspense      |
| Wrong tag in invalidation          | Stale data         | Match cache tags      |
| Over-caching volatile data         | Stale data         | Reduce cacheLife      |

---

## Performance Optimization Tips

### 1. Profile Cache Hit Rates

Monitor cache effectiveness:

```tsx
async function CachedData() {
  'use cache'

  const start = performance.now()
  const data = await fetchData()
  const duration = performance.now() - start

  // Log for analysis
  console.log(`Cache execution: ${duration}ms`)

  return data
}
```

### 2. Optimize Cache Granularity

```tsx
// ❌ Coarse: One big cached component
async function PageContent() {
  'use cache'
  const header = await fetchHeader()
  const posts = await fetchPosts()
  const sidebar = await fetchSidebar()
  return <>{/* everything */}</>
}

// ✅ Fine-grained: Independent cached components
async function Header() {
  'use cache'
  cacheLife('days')
  return await fetchHeader()
}

async function Posts() {
  'use cache'
  cacheLife('hours')
  return await fetchPosts()
}

async function Sidebar() {
  'use cache'
  cacheLife('minutes')
  return await fetchSidebar()
}
```

### 3. Strategic Tag Design

```tsx
// Hierarchical tags for targeted invalidation
cacheTag(
  'posts', // All posts
  `category-${category}`, // Posts in category
  `post-${id}`, // Specific post
  `author-${authorId}` // Author's posts
)

// Invalidate at appropriate level
updateTag(`post-${id}`) // Single post changed
updateTag(`author-${author}`) // Author updated all posts
updateTag('posts') // Nuclear option
```
