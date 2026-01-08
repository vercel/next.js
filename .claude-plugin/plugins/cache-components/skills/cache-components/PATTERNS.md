# Cache Components Patterns & Recipes

Common patterns for implementing Cache Components effectively.

## Pattern 1: Static + Cached + Dynamic Page

The foundational pattern for Partial Prerendering:

```tsx
import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

// Static - no special handling needed
function Header() {
  return <header>My Blog</header>
}

// Cached - included in static shell
async function FeaturedPosts() {
  'use cache'
  cacheLife('hours')

  const posts = await db.posts.findMany({
    where: { featured: true },
    take: 5,
  })

  return (
    <section>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </section>
  )
}

// Dynamic - streams at request time
async function PersonalizedFeed() {
  const session = await getSession()
  const feed = await db.posts.findMany({
    where: { authorId: { in: session.following } },
  })

  return <FeedList posts={feed} />
}

// Page composition
export default async function HomePage() {
  return (
    <>
      <Header />
      <FeaturedPosts />
      <Suspense fallback={<FeedSkeleton />}>
        <PersonalizedFeed />
      </Suspense>
    </>
  )
}
```

---

## Pattern 2: Read-Your-Own-Writes with Server Actions

Ensure users see their changes immediately:

```tsx
// components/posts.tsx
import { cacheTag, cacheLife } from 'next/cache'

async function PostsList() {
  'use cache'
  cacheTag('posts')
  cacheLife('hours')

  const posts = await db.posts.findMany({ orderBy: { createdAt: 'desc' } })
  return (
    <ul>
      {posts.map((p) => (
        <PostItem key={p.id} post={p} />
      ))}
    </ul>
  )
}

// actions/posts.ts
'use server'
import { updateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({
    data: {
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    },
  })

  // Immediate invalidation - user sees new post right away
  updateTag('posts')

  return { success: true, postId: post.id }
}

// components/create-post-form.tsx
'use client'
import { useTransition } from 'react'
import { createPost } from '@/actions/posts'

export function CreatePostForm() {
  const [isPending, startTransition] = useTransition()

  return (
    <form
      action={(formData) => {
        startTransition(() => createPost(formData))
      }}
    >
      <input name="title" required />
      <textarea name="content" required />
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}
```

---

## Pattern 3: Granular Cache Invalidation

Tag caches at multiple levels for precise invalidation:

```tsx
// Cached with multiple tags
async function BlogPost({ postId }: { postId: string }) {
  'use cache'
  cacheTag('posts', `post-${postId}`)
  cacheLife('days')

  const post = await db.posts.findUnique({
    where: { id: postId },
    include: { author: true, comments: true },
  })

  return <Article post={post} />
}

async function AuthorPosts({ authorId }: { authorId: string }) {
  'use cache'
  cacheTag('posts', `author-${authorId}`)
  cacheLife('hours')

  const posts = await db.posts.findMany({
    where: { authorId },
  })

  return <PostGrid posts={posts} />
}

// Server actions with targeted invalidation
'use server'
import { updateTag } from 'next/cache'

export async function updatePost(postId: string, data: FormData) {
  const post = await db.posts.update({
    where: { id: postId },
    data: { title: data.get('title'), content: data.get('content') },
  })

  // Invalidate specific post only
  updateTag(`post-${postId}`)
}

export async function deleteAuthorPosts(authorId: string) {
  await db.posts.deleteMany({ where: { authorId } })

  // Invalidate all author's posts
  updateTag(`author-${authorId}`)
}

export async function clearAllPosts() {
  await db.posts.deleteMany()

  // Nuclear option - invalidate everything tagged 'posts'
  updateTag('posts')
}
```

---

## Pattern 4: Cached Data Fetching Functions

Create reusable cached data fetchers:

```tsx
// lib/data.ts
import { cacheTag, cacheLife } from 'next/cache'

export async function getUser(userId: string) {
  'use cache'
  cacheTag('users', `user-${userId}`)
  cacheLife('hours')

  return db.users.findUnique({ where: { id: userId } })
}

export async function getPostsByCategory(category: string) {
  'use cache'
  cacheTag('posts', `category-${category}`)
  cacheLife('minutes')

  return db.posts.findMany({
    where: { category },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getPopularProducts() {
  'use cache'
  cacheTag('products', 'popular')
  cacheLife('hours')

  return db.products.findMany({
    orderBy: { salesCount: 'desc' },
    take: 10,
  })
}

// Usage in components
async function Sidebar() {
  const popular = await getPopularProducts()
  return <ProductList products={popular} />
}
```

---

## Pattern 5: Stale-While-Revalidate for Background Updates

Use `revalidateTag` for non-critical updates:

```tsx
// For background analytics or non-user-facing updates
'use server'
import { revalidateTag } from 'next/cache'

export async function trackView(postId: string) {
  await db.posts.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
  })

  // Background revalidation - old count shown while updating
  revalidateTag(`post-${postId}`, 'max')
}

// For user-facing mutations, use updateTag instead
export async function likePost(postId: string) {
  await db.likes.create({ data: { postId, userId: getCurrentUserId() } })

  // Immediate - user sees their like right away
  updateTag(`post-${postId}`)
}
```

---

## Pattern 6: Conditional Caching Based on Content

Cache based on content characteristics:

```tsx
async function ContentBlock({ id }: { id: string }) {
  'use cache'

  const content = await db.content.findUnique({ where: { id } })

  // Adjust cache life based on content type
  if (content.type === 'static') {
    cacheLife('max')
    cacheTag('static-content')
  } else if (content.type === 'news') {
    cacheLife('minutes')
    cacheTag('news', `news-${id}`)
  } else {
    cacheLife('default')
    cacheTag('content', `content-${id}`)
  }

  return <ContentRenderer content={content} />
}
```

---

## Pattern 7: Nested Cached Components

Compose cached components for fine-grained caching:

```tsx
// Each component caches independently
async function Header() {
  'use cache'
  cacheTag('layout', 'header')
  cacheLife('days')

  const nav = await db.navigation.findFirst()
  return <Nav items={nav.items} />
}

async function Footer() {
  'use cache'
  cacheTag('layout', 'footer')
  cacheLife('days')

  const footer = await db.footer.findFirst()
  return <FooterContent data={footer} />
}

async function Sidebar({ category }: { category: string }) {
  'use cache'
  cacheTag('sidebar', `category-${category}`)
  cacheLife('hours')

  const related = await db.posts.findMany({
    where: { category },
    take: 5,
  })
  return <RelatedPosts posts={related} />
}

// Page composes cached components
export default async function BlogLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { category: string }
}) {
  return (
    <>
      <Header />
      <main>
        {children}
        <Sidebar category={params.category} />
      </main>
      <Footer />
    </>
  )
}
```

---

## Pattern 8: E-commerce Product Page

Complete example for e-commerce:

```tsx
// app/products/[id]/page.tsx
import { Suspense } from 'react'
import { cacheTag, cacheLife } from 'next/cache'

// Cached product details (changes rarely)
async function ProductDetails({ productId }: { productId: string }) {
  'use cache'
  cacheTag('products', `product-${productId}`)
  cacheLife('hours')

  const product = await db.products.findUnique({
    where: { id: productId },
    include: { images: true, specifications: true },
  })

  return (
    <div>
      <ProductGallery images={product.images} />
      <ProductInfo product={product} />
      <Specifications specs={product.specifications} />
    </div>
  )
}

// Cached reviews (moderate change frequency)
async function ProductReviews({ productId }: { productId: string }) {
  'use cache'
  cacheTag(`product-${productId}-reviews`)
  cacheLife('minutes')

  const reviews = await db.reviews.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return <ReviewsList reviews={reviews} />
}

// Dynamic inventory (real-time)
async function InventoryStatus({ productId }: { productId: string }) {
  // No cache - always fresh
  const inventory = await db.inventory.findUnique({
    where: { productId },
  })

  return (
    <div>
      {inventory.quantity > 0 ? (
        <span className="text-green-600">In Stock ({inventory.quantity})</span>
      ) : (
        <span className="text-red-600">Out of Stock</span>
      )}
    </div>
  )
}

// Page composition
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <ProductDetails productId={id} />

      <Suspense fallback={<InventorySkeleton />}>
        <InventoryStatus productId={id} />
      </Suspense>

      {/* Suspense around cached components:
          - At BUILD TIME (PPR): Cached content is pre-rendered into the static shell,
            so the fallback is never shown for initial page loads.
          - At RUNTIME (cache miss/expiration): When the cache expires or on cold start,
            Suspense shows the fallback while fresh data loads.
          - For long-lived caches ('minutes', 'hours', 'days'), Suspense is optional
            but improves UX during the rare cache miss. */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews productId={id} />
      </Suspense>
    </>
  )
}
```

---

## Pattern 9: Multi-tenant SaaS Application

Handle tenant-specific caching:

```tsx
// lib/tenant.ts
export async function getTenantId() {
  const host = (await headers()).get('host')
  return host?.split('.')[0] // subdomain as tenant ID
}

// Tenant-scoped cached data
async function TenantDashboard({ tenantId }: { tenantId: string }) {
  'use cache'
  cacheTag(`tenant-${tenantId}`, 'dashboards')
  cacheLife('minutes')

  const data = await db.dashboards.findFirst({
    where: { tenantId },
  })

  return <Dashboard data={data} />
}

// Page with tenant context
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardLoader />
    </Suspense>
  )
}

async function DashboardLoader() {
  const tenantId = await getTenantId()
  return <TenantDashboard tenantId={tenantId} />
}

// Tenant-specific invalidation
'use server'
import { updateTag } from 'next/cache'

export async function updateTenantSettings(data: FormData) {
  const tenantId = await getTenantId()

  await db.settings.update({
    where: { tenantId },
    data: {
      /* ... */
    },
  })

  // Only invalidate this tenant's cache
  updateTag(`tenant-${tenantId}`)
}
```

---

## Pattern 10: Subshell Composition with generateStaticParams

Leverage parameter permutations to create reusable subshells:

```tsx
// app/products/[category]/[slug]/page.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

// Product details - uses both params
async function ProductDetails({
  category,
  slug,
}: {
  category: string
  slug: string
}) {
  'use cache'
  cacheTag('products', `product-${slug}`)
  cacheLife('hours')

  const product = await db.products.findUnique({
    where: { category, slug },
  })

  return <ProductCard product={product} />
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params

  return <ProductDetails category={category} slug={slug} />
}

// Provide params to enable subshell generation
export async function generateStaticParams() {
  const products = await db.products.findMany({
    select: { category: true, slug: true },
    take: 100,
  })
  return products.map(({ category, slug }) => ({ category, slug }))
}
```

```tsx
// app/products/[category]/layout.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

// Category header - uses only category param
async function CategoryHeader({ category }: { category: string }) {
  'use cache'
  cacheTag('categories', `category-${category}`)
  cacheLife('days')

  const cat = await db.categories.findUnique({ where: { slug: category } })
  return (
    <header>
      <h1>{cat.name}</h1>
      <p>{cat.description}</p>
    </header>
  )
}

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
      <CategoryHeader category={category} />
      {/* Suspense enables subshell generation */}
      <Suspense fallback={<ProductSkeleton />}>{children}</Suspense>
    </>
  )
}
```

**Result**: When users navigate to `/products/jackets/unknown-jacket`:

1. Category subshell (`/products/jackets/[slug]`) served instantly
2. Product details stream in as they load
3. Future visits to any jacket product reuse the category shell

---

## Pattern 11: Hierarchical Params for Deep Routes

For deeply nested routes, structure layouts to maximize subshell reuse:

```tsx
// Route: /store/[region]/[category]/[productId]

// app/store/[region]/layout.tsx
export default async function RegionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ region: string }>
}) {
  const { region } = await params

  return (
    <>
      <RegionHeader region={region} /> {/* Cached */}
      <RegionPromos region={region} /> {/* Cached */}
      <Suspense>{children}</Suspense> {/* Subshell boundary */}
    </>
  )
}

// app/store/[region]/[category]/layout.tsx
export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ region: string; category: string }>
}) {
  const { region, category } = await params

  return (
    <>
      <CategoryNav region={region} category={category} /> {/* Cached */}
      <Suspense>{children}</Suspense> {/* Subshell boundary */}
    </>
  )
}

// app/store/[region]/[category]/[productId]/page.tsx
export default async function ProductPage({
  params,
}: {
  params: Promise<{ region: string; category: string; productId: string }>
}) {
  const { region, category, productId } = await params

  return <ProductDetails region={region} productId={productId} />
}

export async function generateStaticParams() {
  // Return popular products - subshells generated for all unique region/category combos
  return [
    { region: 'us', category: 'electronics', productId: 'iphone-16' },
    { region: 'us', category: 'electronics', productId: 'macbook-pro' },
    { region: 'us', category: 'clothing', productId: 'hoodie-xl' },
    { region: 'eu', category: 'electronics', productId: 'iphone-16' },
  ]
}
```

**Generated subshells:**

- `/store/us/[category]/[productId]` - US region shell
- `/store/eu/[category]/[productId]` - EU region shell
- `/store/us/electronics/[productId]` - US Electronics shell
- `/store/us/clothing/[productId]` - US Clothing shell
- `/store/eu/electronics/[productId]` - EU Electronics shell

---

## When to Use Suspense with Cached Components

Understanding when Suspense is required vs. optional for cached components:

### Dynamic Components (no cache) → Suspense Required

```tsx
// Dynamic content MUST have Suspense for streaming
async function PersonalizedFeed() {
  const session = await getSession() // Dynamic - reads cookies
  const feed = await fetchFeed(session.userId)
  return <Feed posts={feed} />
}

export default function Page() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <PersonalizedFeed />
    </Suspense>
  )
}
```

### Cached Components → Suspense Optional (but recommended)

```tsx
// Cached content: Suspense is optional but improves UX
async function ProductReviews({ productId }: { productId: string }) {
  'use cache'
  cacheLife('minutes')
  const reviews = await fetchReviews(productId)
  return <ReviewsList reviews={reviews} />
}

// ✅ With Suspense - handles cache miss gracefully
<Suspense fallback={<ReviewsSkeleton />}>
  <ProductReviews productId={id} />
</Suspense>

// ✅ Without Suspense - also valid for long-lived caches
<ProductReviews productId={id} />
```

### Why Cached Components Don't Always Need Suspense

| Scenario | What Happens | Suspense Needed? |
|----------|--------------|------------------|
| **Build time (PPR enabled)** | Content pre-rendered into static shell | No - fallback never shown |
| **Runtime - cache hit** | Cached result returned immediately | No - no suspension |
| **Runtime - cache miss** | Async function executes, component suspends | Yes - for better UX |

### Recommendations by Cache Lifetime

| Cache Lifetime | Suspense Recommendation | Reasoning |
|----------------|------------------------|-----------|
| `'seconds'` | **Recommended** | Frequent cache misses |
| `'minutes'` | Optional | ~5 min expiry, occasional misses |
| `'hours'` / `'days'` | Optional | Rare cache misses |
| `'max'` | Not needed | Essentially static |

### The Trade-off

**Without Suspense**: On cache miss, the page waits for data before rendering anything downstream. For long-lived caches, this is rare and brief.

**With Suspense**: On cache miss, users see the skeleton immediately while data loads. Better perceived performance, slightly more code.

**Rule of thumb**: When in doubt, add Suspense. It never hurts and handles edge cases gracefully.

---

## Anti-Patterns to Avoid

### ❌ Caching user-specific data without parameters

```tsx
// BAD: Same cache for all users
async function UserProfile() {
  'use cache'
  const user = await getCurrentUser() // Different per user!
  return <Profile user={user} />
}

// GOOD: User ID as parameter (becomes cache key)
async function UserProfile({ userId }: { userId: string }) {
  'use cache'
  cacheTag(`user-${userId}`)
  const user = await db.users.findUnique({ where: { id: userId } })
  return <Profile user={user} />
}
```

### ❌ Over-caching volatile data

```tsx
// BAD: Caching real-time data
async function StockPrice({ symbol }: { symbol: string }) {
  'use cache'
  cacheLife('hours') // Stale prices!
  return await fetchStockPrice(symbol)
}

// GOOD: Don't cache, or use very short cache
async function StockPrice({ symbol }: { symbol: string }) {
  'use cache'
  cacheLife('seconds') // 1 second max
  return await fetchStockPrice(symbol)
}

// BETTER: No cache for truly real-time
async function StockPrice({ symbol }: { symbol: string }) {
  return await fetchStockPrice(symbol)
}
```

### ❌ Forgetting Suspense for dynamic content

```tsx
// BAD: No fallback for DYNAMIC content - breaks streaming
export default async function Page() {
  return (
    <>
      <CachedHeader />
      <DynamicContent /> {/* Dynamic - NEEDS Suspense */}
    </>
  )
}

// GOOD: Proper Suspense boundary for dynamic content
export default async function Page() {
  return (
    <>
      <CachedHeader />
      <Suspense fallback={<ContentSkeleton />}>
        <DynamicContent />
      </Suspense>
    </>
  )
}

// ALSO GOOD: Cached content without Suspense (optional for long-lived caches)
export default async function Page() {
  return (
    <>
      <CachedHeader />       {/* 'use cache' - no Suspense needed */}
      <CachedSidebar />      {/* 'use cache' - no Suspense needed */}
      <Suspense fallback={<ContentSkeleton />}>
        <DynamicContent />   {/* Dynamic - Suspense required */}
      </Suspense>
    </>
  )
}
```
