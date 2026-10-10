---
title: Keeping pages static
description: Keep selected route output static as your app changes.
nav_title: Keeping pages static
related:
  title: API reference
  description: Require static output across a route or defer work within one subtree.
  links:
    - app/api-reference/file-conventions/route-segment-config/ensureStatic
    - app/api-reference/functions/prefetch
    - app/api-reference/functions/navigation
---

Before [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents), route segment configs such as [`dynamic = 'force-static'`](/docs/app/guides/caching-without-cache-components#dynamic), `dynamic = 'force-dynamic'`, and `dynamic = 'error'` selected a rendering mode for an entire route. Cache Components lets one route combine prerendered UI, cached content, and request-specific content rendered at request time.

This flexibility is useful for routes that need personalization. Use [`ensureStatic`](/docs/app/api-reference/file-conventions/route-segment-config/ensureStatic) when some or all of a route must avoid request-time server rendering for predictable performance and compute costs.

## Decide what should stay static

Static output does not depend on request-specific data. Next.js can generate it before a request and reuse it across requests.

With [Partial Prefetching](/docs/app/api-reference/config/next-config-js/partialPrefetching), route output becomes available in three [navigation stages](/docs/app/glossary#navigation-stages):

1. A default `<Link>` loads the [App Shell](/docs/app/glossary#app-shell).
2. `<Link prefetch={true}>` can also load content for that link's URL.
3. The navigation renders anything that remains after the click.

Each `ensureStatic` level extends the static requirement through one of these stages. In the following diagram, gray marks static output and blue marks content that can render at request time:

<Image
  alt="The Shell, Prefetch, and Navigation stages, with bars showing how each ensureStatic value extends the static requirement through those stages"
  srcLight="/docs/light/ensure-static-visual.png"
  srcDark="/docs/dark/ensure-static-visual.png"
  width="1200"
  height="530"
/>

Choose a level based on which request must use only static output:

- `'shell'`: the App Shell loaded by a default `<Link>`.
- `'prefetch'`: the App Shell and the [per-link prefetch](/docs/app/guides/optimizing-prefetching) from `<Link prefetch={true}>`, which can include content for the link's [URL data](/docs/app/glossary#url-data), such as `params`.
- `'navigation'`: the complete route, including the response returned after the user navigates.

## Example

The following example adds static requirements to three parts of an online store: its shared cart, product pages, and public buying guides.

```txt
app/
├── store/
│   ├── layout.tsx         # Shared layout with the cart
│   ├── page.tsx           # Product catalog
│   └── products/
│       └── [slug]/
│           └── page.tsx   # Product details and cart status
├── guides/
│   └── [id]/
│       └── page.tsx       # Editorial buying guides
└── ui/
    ├── cart.tsx
    └── product.tsx
lib/
└── guides.ts
```

Enable [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) and [Partial Prefetching](/docs/app/api-reference/config/next-config-js/partialPrefetching):

```ts filename="next.config.ts" highlight={4,5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
}

export default nextConfig
```

### Step 1: Load a static App Shell

The shared store layout displays a visitor's cart count. `CartButton` reads the count from a cookie on the server:

```tsx filename="app/ui/cart.tsx"
import { cookies } from 'next/headers'

export async function CartButton() {
  const value = Number((await cookies()).get('cart-count')?.value ?? 0)
  return <button>Cart ({value})</button>
}
```

The layout places `CartButton` inside `<Suspense>`, which provides a static fallback while the current count renders:

```tsx filename="app/store/layout.tsx"
import Link from 'next/link'
import { Suspense } from 'react'
import { CartButton } from '@/app/ui/cart'

export default function StoreLayout({ children }: LayoutProps<'/store'>) {
  return (
    <>
      <nav>
        <Link href="/store">Products</Link>
        <Link href="/guides">Buying guides</Link>
        <Suspense fallback={<button>Cart (0)</button>}>
          <CartButton />
        </Suspense>
      </nav>
      <main>{children}</main>
    </>
  )
}
```

The navigation and cart fallback are shared across visitors. Loading a link to the store should not render the personalized cart count on the server before the user clicks. Add `ensureStatic = 'shell'` to make a default `<Link>` request only the static App Shell:

```tsx filename="app/store/layout.tsx" highlight={5}
import Link from 'next/link'
import { Suspense } from 'react'
import { CartButton } from '@/app/ui/cart'

export const ensureStatic = 'shell'

export default function StoreLayout({ children }: LayoutProps<'/store'>) {
  // ...
}
```

A default `<Link>` into the store now loads the navigation and `Cart (0)` fallback from static output. The server does not render the current cart count until a later per-link prefetch or navigation requests it. This avoids request-time server work for links that the user may never click.

> **Good to know**: If only `CartButton` needed to be deferred from the App Shell, you could call [`await prefetch()`](/docs/app/api-reference/functions/prefetch) inside that subtree. Here, the requirement applies to the entire store shell, including future changes, so the layout uses `ensureStatic = 'shell'`.

### Step 2: Prefetch static product details

Each product page combines details that can be reused across visitors with a cart action that depends on the current visitor. `ProductDetails` caches its query with [`use cache`](/docs/app/api-reference/directives/use-cache), while `ProductCartStatus` reads a cookie to check whether the product is already in the cart:

```tsx filename="app/ui/product.tsx"
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

type Params = Promise<{ slug: string }>

export async function ProductDetails({ params }: { params: Params }) {
  const { slug } = await params
  const product = await getProduct(slug)
  return <h1>{product.name}</h1>
}

export async function ProductCartStatus({ params }: { params: Params }) {
  const { slug } = await params
  const cart = (await cookies()).get('cart')?.value?.split(',') ?? []
  return (
    <button>{cart.includes(slug) ? 'Remove from cart' : 'Add to cart'}</button>
  )
}

async function getProduct(slug: string) {
  'use cache'
  return db.product.findUniqueOrThrow({ where: { slug } })
}
```

The product route prerenders the catalog's product URL with [`generateStaticParams()`](/docs/app/api-reference/functions/generate-static-params). Separate `<Suspense>` boundaries let the product details render with a static cart fallback:

```tsx filename="app/store/products/[slug]/page.tsx"
import { Suspense } from 'react'
import { ProductCartStatus, ProductDetails } from '@/app/ui/product'

export function generateStaticParams() {
  return [{ slug: 'coffee-grinder' }]
}

export default function ProductPage({
  params,
}: PageProps<'/store/products/[slug]'>) {
  return (
    <>
      <Suspense fallback={<p>Loading product...</p>}>
        <ProductDetails params={params} />
      </Suspense>
      <Suspense fallback={<button>Add to cart</button>}>
        <ProductCartStatus params={params} />
      </Suspense>
    </>
  )
}
```

A default product link loads the App Shell, which contains the product fallback. Because the product details are already prerendered, the catalog can include them before the click by setting `prefetch={true}`:

```tsx filename="app/store/page.tsx"
<Link href="/store/products/coffee-grinder" prefetch={true}>
  Coffee grinder
</Link>
```

Each visible `prefetch={true}` link can render `ProductCartStatus` to personalize the cart action for that product. A grid with 20 visible products can therefore trigger 20 request-time server renders before the user clicks a product.

Add `ensureStatic = 'prefetch'` to make every product prefetch use only static output:

```tsx filename="app/store/products/[slug]/page.tsx" highlight={4}
import { Suspense } from 'react'
import { ProductCartStatus, ProductDetails } from '@/app/ui/product'

export const ensureStatic = 'prefetch'

export default function ProductPage({
  params,
}: PageProps<'/store/products/[slug]'>) {
  // ...
}
```

Each product prefetch now includes the cached product details and the static **Add to cart** fallback without invoking request-time server rendering. The current cart status renders after the user follows the link.

An `ensureStatic` value covers the whole route, including layouts above the segment that exports it. On product routes, `'prefetch'` also keeps the store layout static through the per-link prefetch.

> **Good to know**: If only `ProductCartStatus` needed to be deferred from per-link prefetches, you could call [`await navigation()`](/docs/app/api-reference/functions/navigation) before reading the cookie. Here, every product prefetch must avoid request-time server rendering, so the page uses `ensureStatic = 'prefetch'`.

### Step 3: Prerender the buying guides

The store also has public buying guides. Each guide reads its content from the database and applies a theme from a cookie:

```tsx filename="app/guides/[id]/page.tsx"
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { getGuide } from '@/lib/guides'

export default function GuidePage({ params }: PageProps<'/guides/[id]'>) {
  return (
    <Suspense fallback={<p>Loading guide...</p>}>
      <Guide params={params} />
    </Suspense>
  )
}

async function Guide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guide = await getGuide(id)
  const theme = (await cookies()).get('theme')?.value
  return <article data-theme={theme}>{guide.content}</article>
}
```

The existing `getGuide()` helper performs the database query:

```ts filename="lib/guides.ts"
import { db } from '@/lib/db'

export async function getGuide(id: string) {
  return db.guide.findUniqueOrThrow({ where: { id } })
}
```

`next build` currently produces partial prerenders for the store routes and the buying guides:

```text filename="Terminal"
Route (app)
├   /guides/[id]
│ └ ◐ /guides/[id]
├ ◐ /store
└   /store/products/[slug]
  ├ ◐ /store/products/[slug]
  └ ◐ /store/products/coffee-grinder

◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

Partial output is expected for the store and product routes because their request-specific cart UI renders later. The buying guides are public editorial pages, so they should return complete static output without request-time server rendering. Add `ensureStatic = 'navigation'`:

```diff filename="app/guides/[id]/page.tsx"
  import { Suspense } from 'react'
  import { cookies } from 'next/headers'

+ export const ensureStatic = 'navigation'

  export default function GuidePage({ params }) {
    // ...
  }
```

When running `next build` again, Next.js first reports that the dynamic route does not provide any parameter values to prerender:

```bash filename="Terminal"
Error: Page "/guides/[id]": `ensureStatic = "navigation"` requires an exported `generateStaticParams()` function.
Learn more: https://nextjs.org/docs/messages/generate-static-params#with-ensurestatic
    at ignore-listed frames
> Build error occurred
Error: Failed to collect page data for /guides/[id]
```

Export `generateStaticParams()` and return at least one buying guide ID. Next.js prerenders the returned IDs during the build. It can generate other allowed IDs on their first request and store the result for later requests. With `'navigation'`, that first request waits for the complete static page instead of streaming a fallback. See [ISR with Cache Components](/docs/app/guides/incremental-static-regeneration-cache-components#at-runtime).

Add a helper that returns the guide IDs to prerender:

```ts filename="lib/guides.ts"
export async function getGuideIds() {
  const guides = await db.guide.findMany({ select: { id: true } })
  return guides.map(({ id }) => id)
}
```

```tsx filename="app/guides/[id]/page.tsx" highlight={3,7-10}
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { getGuide, getGuideIds } from '@/lib/guides'

export const ensureStatic = 'navigation'

export async function generateStaticParams() {
  const ids = await getGuideIds()
  return ids.map((id) => ({ id }))
}

export default function GuidePage({ params }: PageProps<'/guides/[id]'>) {
  return (
    <Suspense fallback={<p>Loading guide...</p>}>
      <Guide params={params} />
    </Suspense>
  )
}

async function Guide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guide = await getGuide(id)
  const theme = (await cookies()).get('theme')?.value
  return <article data-theme={theme}>{guide.content}</article>
}
```

`generateStaticParams()` provides the parameter values, but the guide still contains uncached and request-specific work. The next build reports that the route cannot be fully static:

```bash filename="Terminal"
Error: Route "/guides/[id]": Next.js encountered uncached or runtime data on a route that must be fully static.

This route is configured to be fully static, but uncached or runtime data prevents it from being fully prerendered.

Ways to fix this:
  - [cache] For uncached data (`fetch`, database calls): cache the access with `"use cache"` (does not apply to `connection()`)
  - [remove] Remove the data access
  - [client] Read the data on the client

Learn more: https://nextjs.org/docs/messages/static-route-dynamic
    at Suspense (<anonymous>)
    at body (<anonymous>)
    at html (<anonymous>)
```

The build identifies the affected route, but its stack frames do not include source locations for the data access. To get source-mapped code frames while fixing it, start `next dev` and open `/guides/coffee`. If you can only run a build, use [`next build --debug-prerender`](/docs/app/guides/building#debug-prerender-errors).

The development overlay first points to the uncached database query:

```ts filename="lib/guides.ts" highlight={1}
return db.guide.findUniqueOrThrow({ where: { id } })
```

It presents three ways to handle uncached data:

<FixCardGrid>
  <FixCard
    group="cache"
    title="Cache the data"
    href="/docs/messages/static-route-dynamic#cache-the-data"
    snippets={[
      { text: 'async function getData() {' },
      { text: '  "use cache"', highlight: true },
      { text: '  return await db.query(…)' },
    ]}
  />
  <FixCard
    group="remove"
    title="Remove the data access"
    href="/docs/messages/static-route-dynamic#remove-the-data-access"
    snippets={[
      { text: 'async function Page() {' },
      { text: '- await connection()', highlight: true },
      { text: '  return <Content />' },
    ]}
  />
  <FixCard
    group="client"
    title="Read the data on the client"
    href="/docs/messages/static-route-dynamic#read-the-data-on-the-client"
    snippets={[
      { text: "'use client'" },
      { text: "const data = useSWR('/api')", highlight: true },
      { text: 'return <Content data={data} />' },
    ]}
  />
</FixCardGrid>

The buying-guide content can be shared across visitors, so the **Cache** fix preserves the page's static requirement. Add the [`'use cache'` directive](/docs/app/api-reference/directives/use-cache) to `getGuide()` so Next.js can reuse the query result:

```ts filename="lib/guides.ts" highlight={9}
import { db } from '@/lib/db'

export async function getGuideIds() {
  const guides = await db.guide.findMany({ select: { id: true } })
  return guides.map(({ id }) => id)
}

export async function getGuide(id: string) {
  'use cache'
  return db.guide.findUniqueOrThrow({ where: { id } })
}
```

After the query is cached, the overlay points to the remaining request-specific value:

```tsx filename="app/guides/[id]/page.tsx" highlight={1}
const theme = (await cookies()).get('theme')?.value
```

The overlay now presents the fixes for runtime data:

<FixCardGrid>
  <FixCard
    group="remove"
    title="Remove the data access"
    href="/docs/messages/static-route-runtime#remove-the-data-access"
    snippets={[
      { text: 'async function Page() {' },
      { text: '- const store = await cookies()', highlight: true },
      { text: '  return <Content />' },
    ]}
  />
  <FixCard
    group="client"
    title="Read the data on the client"
    href="/docs/messages/static-route-runtime#read-the-data-on-the-client"
    snippets={[
      { text: "'use client'" },
      { text: "use(browser('Read cookie'))", highlight: true },
      { text: 'document.cookie.match(/cart=/)' },
    ]}
  />
</FixCardGrid>

The buying guides do not need a visitor-specific theme, so remove the cookie access:

```diff filename="app/guides/[id]/page.tsx"
  import { Suspense } from 'react'
- import { cookies } from 'next/headers'
  import { getGuide, getGuideIds } from '@/lib/guides'

  // ...

  async function Guide({ params }) {
    const { id } = await params
    const guide = await getGuide(id)
-   const theme = (await cookies()).get('theme')?.value
-   return <article data-theme={theme}>{guide.content}</article>
+   return <article>{guide.content}</article>
  }
```

With the database query cached and the request-specific theme removed, `next build` produces a complete static page for the listed guide:

```text filename="Terminal"
Route (app)
├   /guides/[id]
│ ├ ◐ /guides/[id]
│ └ ○ /guides/coffee
├ ◐ /store
└   /store/products/[slug]
  ├ ◐ /store/products/[slug]
  └ ◐ /store/products/coffee-grinder

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

The listed guide is now fully prerendered. For an unlisted guide ID, the first request waits while Next.js generates and stores the complete static page. The buying guides no longer perform request-time server rendering, and `ensureStatic` will report future changes that would break that requirement.

The store now loads shared navigation from its static App Shell, includes cached product details in per-link prefetches without invoking the server, and returns complete static output for buying guides. Personalized cart data still renders when it is needed.

## Next steps

- [Optimize prefetching](/docs/app/guides/optimizing-prefetching#defer-work-to-a-later-stage) to control when individual subtrees render.
- [Ensure instant navigations](/docs/app/guides/instant-navigation) to validate that client navigations into the store show UI immediately.
- [Migrate to Cache Components](/docs/app/guides/migrating-to-cache-components) to replace route-level configs such as `dynamic = 'force-static'` in an existing app.
