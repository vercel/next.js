# Cache Components API Reference

Complete API reference for Next.js Cache Components.

## Directive: `'use cache'`

Marks a function or file as cacheable. The cached output is included in the static shell during Partial Prerendering.

### Syntax

```tsx
// File-level (applies to all exports)
'use cache'

export async function getData() {
  /* ... */
}

// Function-level
async function Component() {
  'use cache'
  // ...
}
```

### Variants

| Directive              | Description              | Cache Storage            |
| ---------------------- | ------------------------ | ------------------------ |
| `'use cache'`          | Standard cache (default) | Default handler + Remote |
| `'use cache: private'` | User-specific cache      | Resume Data Cache only   |
| `'use cache: remote'`  | Platform remote cache    | Remote handler only      |

### `'use cache: private'`

Allows reading `cookies()` and `headers()` directly. Not included in static shell.

```tsx
async function UserSpecificContent() {
  'use cache: private'

  const userId = (await cookies()).get('userId')?.value
  const data = await fetchUserData(userId)

  return <div>{data.name}</div>
}
```

**Limitations**:

- Cannot be nested inside regular `'use cache'`
- Not stored in persistent cache handlers
- Dynamic at request time

### `'use cache: remote'`

Uses platform-specific remote cache handler. Requires network roundtrip.

```tsx
async function HeavyComputation() {
  'use cache: remote'
  cacheLife('days')

  return await expensiveCalculation()
}
```

### Rules

1. **Must be async** - All cached functions must return a Promise
2. **First statement** - `'use cache'` must be the first statement in the function body
3. **No runtime APIs** - Cannot call `cookies()`, `headers()`, `searchParams` directly (except in `'use cache: private'`)
4. **Serializable arguments** - All arguments must be serializable (no functions, class instances)

---

## Function: `cacheLife()`

Configures cache duration and revalidation behavior.

### Import

```tsx
import { cacheLife } from 'next/cache'
```

### Signature

```tsx
function cacheLife(profile: string): void
function cacheLife(options: CacheLifeOptions): void

interface CacheLifeOptions {
  stale?: number // Client cache duration (seconds)
  revalidate?: number // Background revalidation window (seconds)
  expire?: number // Absolute expiration (seconds)
}
```

### Parameters

| Parameter    | Description                                             | Constraint            |
| ------------ | ------------------------------------------------------- | --------------------- |
| `stale`      | How long the client can cache without server validation | `stale ≤ revalidate`  |
| `revalidate` | When to start background refresh                        | `revalidate ≤ expire` |
| `expire`     | Absolute expiration; deopts to dynamic if exceeded      | Must be largest       |

### Predefined Profiles

| Profile     | stale   | revalidate     | expire        |
| ----------- | ------- | -------------- | ------------- |
| `'default'` | 0       | 900 (15min)    | 3600 (1hr)    |
| `'seconds'` | 0       | 1              | 60            |
| `'minutes'` | 60      | 300 (5min)     | 3600 (1hr)    |
| `'hours'`   | 300     | 3600 (1hr)     | 86400 (1day)  |
| `'days'`    | 3600    | 86400 (1day)   | 604800 (1wk)  |
| `'weeks'`   | 86400   | 604800 (1wk)   | 2592000 (30d) |
| `'max'`     | 2592000 | 31536000 (1yr) | Infinity      |

### Custom Profiles

Define custom profiles in `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  cacheLife: {
    // Custom profile
    'blog-posts': {
      stale: 300, // 5 minutes
      revalidate: 3600, // 1 hour
      expire: 86400, // 1 day
    },
    // Override default
    default: {
      stale: 60,
      revalidate: 600,
      expire: 3600,
    },
  },
}
```

### Usage

```tsx
async function BlogPosts() {
  'use cache'
  cacheLife('blog-posts') // Custom profile

  return await db.posts.findMany()
}
```

### HTTP Cache-Control Mapping

```
stale     → max-age
revalidate → s-maxage
expire - revalidate → stale-while-revalidate

Example: stale=60, revalidate=3600, expire=86400
→ Cache-Control: max-age=60, s-maxage=3600, stale-while-revalidate=82800
```

---

## Function: `cacheTag()`

Tags cached data for targeted invalidation.

### Import

```tsx
import { cacheTag } from 'next/cache'
```

### Signature

```tsx
function cacheTag(...tags: string[]): void
```

### Usage

```tsx
async function UserProfile({ userId }: { userId: string }) {
  'use cache'
  cacheTag('users', `user-${userId}`) // Multiple tags
  cacheLife('hours')

  return await db.users.findUnique({ where: { id: userId } })
}
```

### Tagging Strategies

**Entity-based tagging**:

```tsx
cacheTag('posts') // All posts
cacheTag(`post-${postId}`) // Specific post
cacheTag(`user-${userId}-posts`) // User's posts
```

**Feature-based tagging**:

```tsx
cacheTag('homepage')
cacheTag('dashboard')
cacheTag('admin')
```

**Combined approach**:

```tsx
cacheTag('posts', `post-${id}`, `author-${authorId}`)
```

---

## Function: `updateTag()`

Immediately invalidates cache entries and ensures read-your-own-writes.

### Import

```tsx
import { updateTag } from 'next/cache'
```

### Signature

```tsx
function updateTag(tag: string): void
```

### Usage

```tsx
'use server'
import { updateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({ data: formData })

  updateTag('posts') // Invalidate all posts
  updateTag(`user-${userId}`) // Invalidate user's cache

  // Client immediately sees fresh data
}
```

### Behavior

- **Immediate**: Cache invalidated synchronously
- **Read-your-own-writes**: Subsequent reads return fresh data
- **Server Actions only**: Must be called from Server Actions

---

## Function: `revalidateTag()`

Marks cache entries as stale for background revalidation.

### Import

```tsx
import { revalidateTag } from 'next/cache'
```

### Signature

```tsx
function revalidateTag(tag: string): void
```

### Usage

```tsx
'use server'
import { revalidateTag } from 'next/cache'

export async function updateSettings(data: FormData) {
  await db.settings.update({ data })

  revalidateTag('settings') // Mark stale, revalidate in background
}
```

### Behavior

- **Stale-while-revalidate**: Serves cached content while refreshing
- **Background refresh**: New cache populated asynchronously
- **Lower priority**: Use when immediate consistency isn't required

---

## Function: `revalidatePath()`

Revalidates all cache entries associated with a path.

### Import

```tsx
import { revalidatePath } from 'next/cache'
```

### Signature

```tsx
function revalidatePath(path: string, type?: 'page' | 'layout'): void
```

### Usage

```tsx
'use server'
import { revalidatePath } from 'next/cache'

export async function updateBlog() {
  await db.posts.update({
    /* ... */
  })

  revalidatePath('/blog') // Specific path
  revalidatePath('/blog', 'layout') // Layout and all children
  revalidatePath('/', 'layout') // Entire app
}
```

---

## Configuration: `next.config.ts`

### Enable Cache Components

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

### Configure Cache Handlers

```typescript
const nextConfig: NextConfig = {
  cacheHandlers: {
    default: {
      maxMemorySize: 52428800, // 50MB
    },
    // Platform-specific remote handler
    remote: CustomRemoteHandler,
  },
}
```

### Define Cache Profiles

```typescript
const nextConfig: NextConfig = {
  cacheLife: {
    default: {
      stale: 60,
      revalidate: 3600,
      expire: 86400,
    },
    posts: {
      stale: 300,
      revalidate: 3600,
      expire: 604800,
    },
  },
}
```

---

## `generateStaticParams` with Cache Components

When Cache Components is enabled, `generateStaticParams` behavior changes significantly.

### Parameter Permutation Rendering

Next.js renders ALL permutations of provided parameters to create reusable subshells:

```tsx
// app/products/[category]/[slug]/page.tsx
export async function generateStaticParams() {
  return [
    { category: 'jackets', slug: 'bomber' },
    { category: 'jackets', slug: 'parka' },
    { category: 'shoes', slug: 'sneakers' },
  ]
}
```

**Rendered routes:**

| Route                         | Params Known       | Shell Type        |
| ----------------------------- | ------------------ | ----------------- |
| `/products/jackets/bomber`    | category ✓, slug ✓ | Complete page     |
| `/products/jackets/parka`     | category ✓, slug ✓ | Complete page     |
| `/products/shoes/sneakers`    | category ✓, slug ✓ | Complete page     |
| `/products/jackets/[slug]`    | category ✓, slug ✗ | Category subshell |
| `/products/shoes/[slug]`      | category ✓, slug ✗ | Category subshell |
| `/products/[category]/[slug]` | category ✗, slug ✗ | Fallback shell    |

### Requirements

1. **Must return at least one parameter set** - Empty arrays cause build errors
2. **Params validate static safety** - Next.js uses provided params to verify no dynamic APIs are accessed
3. **Subshells require Suspense** - If accessing unknown params without Suspense, no subshell is generated

```tsx
// ❌ BUILD ERROR: Empty array not allowed
export function generateStaticParams() {
  return []
}

// ✅ CORRECT: Provide at least one param set
export async function generateStaticParams() {
  const products = await getProducts({ limit: 100 })
  return products.map((p) => ({ category: p.category, slug: p.slug }))
}
```

### Subshell Generation with Layouts

Create category-level subshells by adding Suspense in layouts:

```tsx
// app/products/[category]/layout.tsx
export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ category: string }>
}) {
  const { category } = await params

  return (
    <>
      <h2>{category}</h2>
      <Suspense>{children}</Suspense> {/* Creates subshell boundary */}
    </>
  )
}
```

Now `/products/jackets/[slug]` generates a reusable shell with the category header, streaming product details when visited.

### Why Subshells Matter

Without `generateStaticParams`, visiting `/products/jackets/unknown-product`:

- **Before**: Full dynamic render, user waits for everything
- **After**: Cached category subshell served instantly, product details stream in

---

## Deprecated Segment Configurations

These exports are **deprecated** when `cacheComponents: true`:

### `export const revalidate` (Deprecated)

**Before:**

```tsx
// app/products/page.tsx
export const revalidate = 3600 // 1 hour

export default async function ProductsPage() {
  const products = await db.products.findMany()
  return <ProductList products={products} />
}
```

**Problems with this approach:**

- Revalidation time lived at segment level, not with the data
- Couldn't vary revalidation based on fetched data
- No control over client-side caching (`stale`) or expiration

**After (Cache Components):**

```tsx
// app/products/page.tsx
import { cacheLife } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheLife('hours') // Co-located with the data

  return await db.products.findMany()
}

export default async function ProductsPage() {
  const products = await getProducts()
  return <ProductList products={products} />
}
```

**Benefits:**

- Cache lifetime co-located with data fetching
- Granular control: `stale`, `revalidate`, and `expire`
- Different functions can have different lifetimes
- Can conditionally set cache life based on data

### `export const dynamic` (Deprecated)

**Before:**

```tsx
// app/products/page.tsx
export const dynamic = 'force-static'

export default async function ProductsPage() {
  // Headers would return empty, silently breaking components
  const headers = await getHeaders()
  return <ProductList />
}
```

**Problems:**

- All-or-nothing approach
- `force-static` silently broke dynamic APIs (cookies, headers return empty)
- `force-dynamic` prevented any static optimization
- Hidden bugs when dynamic components received empty data

**After (Cache Components):**

```tsx
// app/products/page.tsx
export default async function ProductsPage() {
  return (
    <>
      <CachedProductList /> {/* Static via 'use cache' */}
      <Suspense fallback={<Skeleton />}>
        <DynamicUserRecommendations /> {/* Dynamic via Suspense */}
      </Suspense>
    </>
  )
}
```

**Benefits:**

- No silent API failures
- Granular static/dynamic at component level
- Build errors guide you to correct patterns
- Pages can be BOTH static AND dynamic

### Migration Guide

| Old Pattern                              | New Pattern                                            |
| ---------------------------------------- | ------------------------------------------------------ |
| `export const revalidate = 60`           | `cacheLife({ revalidate: 60 })` inside `'use cache'`   |
| `export const revalidate = 0`            | Remove cache or use `cacheLife('seconds')`             |
| `export const revalidate = false`        | `cacheLife('max')` for long-term caching               |
| `export const dynamic = 'force-static'`  | Use `'use cache'` on data fetching                     |
| `export const dynamic = 'force-dynamic'` | Wrap in `<Suspense>` without cache                     |
| `export const dynamic = 'auto'`          | Default behavior - not needed                          |
| `export const dynamic = 'error'`         | Default with Cache Components (build errors guide you) |

---

## Type Definitions

### CacheLife

```typescript
type CacheLife = {
  stale?: number // Default: 0
  revalidate?: number // Default: profile-dependent
  expire?: number // Default: profile-dependent
}
```

### CacheLifeProfile

```typescript
type CacheLifeProfile =
  | 'default'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'max'
  | string // Custom profiles
```
