# Refactor patterns — push dynamic down into the shell

Each pattern is **before → after**: keep as much as possible in the prerendered shell, and wrap only genuinely per-request work in a tight `<Suspense>` (or hoist it into `use cache`). Production shapes — parallel-route slots, deferring an auth gate, client slot-routers — are in `real-app-patterns.md`.

These recipes grow both concrete URL-specific static shells and reusable App Shells. With Cache Components, an ungenerated URL may use the App Shell as its direct-visit/ISR fallback. Partial Prefetching separately makes that reusable shell the default Link prefetch baseline. The App Shell is independent of non-root params, search params, and the full URL. Supported root params may key shell variants, and cookies/headers may produce a session-specific App Shell. Do not assume every value in a concrete static shell also belongs to the App Shell.

---

## 1. Awaiting at the top → move the await into a Suspense child

The most common blocking shape. Awaiting request-time data at the top of a page/layout makes **everything below it** dynamic.

```tsx
// ❌ before — top-level await of a non-static param + uncached data
export default async function Page(props: PageProps<'/store/[slug]'>) {
  const { slug } = await props.params
  const product = await db.products.findBySlug(slug)
  return (
    <article>
      <h1>{product.name}</h1>
    </article>
  )
}
```

```tsx
// ✅ after — pass the params promise down; await inside a Suspense-wrapped child
import { Suspense } from 'react'

export default function Page(props: PageProps<'/store/[slug]'>) {
  return (
    <Suspense fallback={<p>Loading product…</p>}>
      <Product params={props.params} />
    </Suspense>
  )
}

async function Product({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await db.products.findBySlug(slug)
  return (
    <article>
      <h1>{product.name}</h1>
    </article>
  )
}
```

Inline variant when you don't want a separate component — unwrap the promise without awaiting at the top:

```tsx
export default function Page(props: PageProps<'/store/[category]'>) {
  return (
    <Suspense fallback={<Grid.Skeleton />}>
      {props.params.then(({ category }) => (
        <ProductGrid category={category} />
      ))}
    </Suspense>
  )
}
```

---

## 2. `cookies()` / `headers()` in a layout → start, don't await; pass down

A layout that awaits request data blocks the layout **and every page under it**.

```tsx
// ❌ before — whole layout (and all children) becomes dynamic
export default async function Layout({ children }) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value
  return <body data-theme={theme}>{children}</body>
}
```

```tsx
// ✅ after — start the read without awaiting, pass the promise to a Suspense child
import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default function Layout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies() // not awaited → does not block the shell
  return (
    <body>
      <nav>
        <Suspense fallback={<UserMenu.Skeleton />}>
          <UserMenu cookiePromise={cookieStore} />
        </Suspense>
      </nav>
      {children}
    </body>
  )
}

async function UserMenu({
  cookiePromise,
}: {
  cookiePromise: ReturnType<typeof cookies>
}) {
  const theme = (await cookiePromise).get('theme')?.value
  return <div data-theme={theme}>…</div>
}
```

`{children}` and `<nav>` stay outside the deferred hard-load boundary; only `<UserMenu>` streams when the request data is unavailable to that prerender. Under Partial Prefetching, cookies and headers may resolve while producing a session-specific App Shell, so `<UserMenu>` can be part of that per-session client-cached shell.

---

## 3. Uncached fetch / DB read → choose `use cache` _or_ `<Suspense>`

Decide per data source. Same-for-everyone & rarely-changing → cache it (it joins the concrete static shell). Per-request & must-be-fresh → leave it uncached behind a boundary. Cached content that depends on a concrete URL is not automatically part of the shared App Shell; a `prefetch={true}` link may fetch it in addition to the shell.

```tsx
// ❌ before — both block the shell
const product = await db.products.findBySlug(slug) // rarely changes
const inventory = await db.inventory.findBySlug(slug) // must be fresh
```

```tsx
// ✅ after — cache the stable one (shell), defer the fresh one (streams)
async function getProduct(slug: string) {
  'use cache' // → resolved at prerender, lands in the shell
  return db.products.findBySlug(slug)
}

;<Suspense fallback={<p>Checking availability…</p>}>
  <Inventory params={params} /> {/* uncached read stays here, streams in */}
</Suspense>
```

> A bare `'use cache'` applies the `default` `cacheLife` profile. Choose freshness explicitly with `cacheLife('<profile>')` (`default` / `seconds` / `minutes` / `hours` / `days` / `weeks` / `max`) rather than shipping the default lifetime by omission.
>
> Serverless note: `use cache` is in-memory and does not persist across instances — use [`use cache: remote`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote) for a durable shell.

---

## 4. Dynamic params → known-URL prerender or App Shell boundary

If the set of params is enumerable, prerender them so `await params` resolves into the concrete static shell for those known URLs. That helps direct visits and cached/full prefetches, but it does not put non-root param values in the reusable App Shell. When the reusable App Shell is the target — for a default Partial Prefetching Link or an ungenerated direct visit — keep param-independent UI outside a boundary and move the param consumer inside it even for generated values.

```tsx
// ✅ option A — optimize only the known-URL prerender
// This does not make param-dependent UI part of the App Shell.
export function generateStaticParams() {
  return [{ slug: 'shoes' }, { slug: 'hats' }]
}
export default async function Page({ params }: PageProps<'/store/[slug]'>) {
  const { slug } = await params // known at build → shell-safe
  // ...
}
```

```tsx
// ✅ option B — build a reusable App Shell; await params inside a boundary
// Use pattern #1 whether or not generateStaticParams also lists known URLs.
```

Root params (the dynamic segments the root layout sits inside, e.g. `app/[lang]/layout.tsx`) are readable from any Server Component via `next/root-params` without prop-drilling — but under Cache Components they must still be enumerated by `generateStaticParams` (at least one value per root param) to land in the static shell. Unlike non-root params, supported root params may also key App Shell variants.

---

## 5. `searchParams` → always behind `<Suspense>` (on page load)

Search params are never known at build, so awaiting them (or `useSearchParams()`) suspends on a page load. Keep the rest of the page in the shell by isolating the consumer.

```tsx
// ✅ static content stays in the shell; the search-dependent part streams
export default function Page(props: PageProps<'/search'>) {
  return (
    <>
      <h1>Search</h1> {/* shell */}
      <Suspense fallback={<Results.Skeleton />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
async function Results({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return <ResultList query={q} />
}
```

On a **client navigation**, a full or runtime-prefetched result may include search-dependent content because the concrete URL is known. The shared App Shell does not: under Partial Prefetching, a default Link shows this boundary's fallback until the URL-specific result arrives. You still need the boundary for the page-load path too.

---

## 6. Non-deterministic values → `connection()` + `<Suspense>`, or cache

`Math.random()`, `Date.now()`, `crypto.randomUUID()` produce different output each run, so Cache Components makes you choose: per-request (defer) or fixed (cache).

```tsx
// ✅ per-request value: gate on connection() and wrap in Suspense
import { connection } from 'next/server'
async function RequestId() {
  await connection()
  return <span>{crypto.randomUUID()}</span>
}
// <Suspense fallback={null}><RequestId /></Suspense>
```

```tsx
// ✅ same value for everyone: cache it so it joins the shell
async function buildId() {
  'use cache'
  return Date.now()
}
```

---

## 7. Dynamic `generateMetadata` → static export, `use cache`, or a dynamic-marker for runtime data

```tsx
// ❌ before — reading request data blocks the route's metadata
export async function generateMetadata() {
  const c = await cookies()
  return { title: c.get('title')?.value }
}
```

```tsx
// ✅ option A — static
export const metadata = { title: 'Store' }

// ✅ option B — cache the metadata (depends on external data, not runtime data)
export async function generateMetadata() {
  'use cache'
  return { title: await getTitle() }
}
```

```tsx
// ✅ option C — metadata genuinely needs runtime data (cookies/headers):
// keep generateMetadata dynamic, and add a dynamic-marker component to the
// page so the rest of the page still prerenders into the shell.
import { Suspense } from 'react'
import { connection } from 'next/server'
import { cookies } from 'next/headers'

export async function generateMetadata() {
  const token = (await cookies()).get('token')?.value
  return { title: token ? 'Personalized' : 'Store' }
}

async function DynamicMarker() {
  await connection() // signals intentional dynamic content
  return null
}

export default function Page() {
  return (
    <>
      <article>{/* static content — stays in the shell */}</article>
      <Suspense>
        <DynamicMarker />
      </Suspense>
    </>
  )
}
```

`generateViewport` is the same, except dynamic viewport blocks the **whole page**. Genuine instant fixes: a static `viewport` export, or `use cache`. The other two are dynamic-acceptance opt-outs, not instant fixes — do not treat them as a way to reach GREEN: `export const instant = false` opts the segment out of validation while the navigation still blocks, and a `<Suspense>` above the document `<body>` makes the whole route dynamic.

---

## 8. Keep the stable LCP structure in the target shell

For a URL-specific prerender, cached param data can keep the concrete product heading outside a boundary. That does not make the product name part of the reusable App Shell. When the App Shell is the target, keep stable heading structure or a meaningful skeleton outside and isolate the param-specific value.

```tsx
// ✅ known-URL prerender only: cached name paints in its concrete static shell
<h1>{product.name}</h1>                 {/* static shell; cache the name if needed */}
<Suspense fallback={<Reviews.Skeleton />}>
  <Reviews productId={id} />            {/* streams */}
</Suspense>
```

```tsx
// ✅ reusable App Shell: stable chrome paints; URL data resolves inside
<h1>
  Product
  <Suspense fallback={<ProductName.Skeleton />}>
    <ProductName params={params} />
  </Suspense>
</h1>
```

---

## 9. Granularity below shared layouts (client-nav correctness)

A single boundary in the **root** layout passes a page-load check but leaves sibling client navigations blocking. Put a boundary **below the shared layout**.

```tsx
// app/store/layout.tsx — boundary below the /store shared layout covers
//   client navs like /store/shoes → /store/hats (the root boundary does not)
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <section>
      <StoreNav /> {/* shell */}
      <Suspense fallback={<Page.Skeleton />}>{children}</Suspense>
    </section>
  )
}
```

Prefer per-component boundaries inside the page (patterns #1–#5) over one big layout boundary — they keep more real content in the shell and stream independently.

## 10. Extend a useful App Shell with runtime prefetching

Patterns 1–9 establish a meaningful static shell or App Shell floor. Keep that floor: runtime prefetching is an optional upgrade for selected links whose users benefit from receiving eligible URL-specific content before the click. It is not a replacement for a shell, a hard-navigation fix, or the way to adopt Partial Prefetching (`prefetch = 'partial'` is the incremental adoption value).

Runtime prefetching has **two halves — both required**:

```tsx
// 1. The destination permits eligible runtime work during a full prefetch.
export const prefetch = 'allow-runtime'

// 2. This selected Link asks for more than the default App Shell.
<Link href={href} prefetch={true}>…</Link>
```

With Partial Prefetching active, the default/auto Link still fetches only the App Shell. The full Link can additionally include cached page content plus eligible `params`, `searchParams`, and full-URL-dependent work. Cookies and headers may already be present in a session-specific App Shell. Fresh uncached reads and work gated by `connection()` stay behind their fallbacks.

Under `instant()`, the clicked full Link's richer entry may commit. A GREEN therefore proves that link's configured immediate UI, not that the underlying App Shell is useful. Keep a positive marker that belongs to the App Shell and choose the negative/deferred marker according to the phase-A1 contract.

Gotchas:

- **The full Link is required.** `allow-runtime` on the destination does not make a default/auto Link fetch beyond the App Shell.
- **Adoption comes first.** A segment cannot export both values. Keep `prefetch = 'partial'` during incremental rollout. After enabling `partialPrefetching` app-wide, replace that now-redundant export with `prefetch = 'allow-runtime'` only on selected destinations.
- **The cost is per link.** Each visible full-prefetch Link can wake the server. Use it only where the additional immediate content justifies that work.
- **Uncached stays deferred.** Do not expect `connection()`, a must-be-fresh database read, or other uncached work to become prefetched merely because the route allows runtime prefetching.
- **Marker must be a committed node, not RSC bytes.** The content is often a client component, so its text is not in the prefetch response — assert a `data-testid` that renders when the client subtree commits, not a substring of the stream.

Prefer the App Shell whenever it is already a good loading experience. Add runtime prefetching only when a specific link has valuable eligible content beyond that floor.
