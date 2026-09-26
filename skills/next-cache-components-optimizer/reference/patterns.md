# Refactor patterns — push dynamic down into the shell

Each pattern is **before → after**: keep as much as possible in the prerendered shell, and wrap only genuinely per-request work in a tight `<Suspense>` (or hoist it into `use cache`). Production shapes — parallel-route slots, deferring an auth gate, client slot-routers — are in `real-app-patterns.md`.

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

**Insight:** [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime).

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

`{children}` and `<nav>` stay in the shell; only `<UserMenu>` streams.

**Insight:** [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime).

---

## 3. Uncached fetch / DB read → choose `use cache` _or_ `<Suspense>`

Decide per data source. Same-for-everyone & rarely-changing → cache it (it joins the shell). Per-request & must-be-fresh → leave it uncached behind a boundary.

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

**Insight:** [uncached data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-dynamic).

---

## 4. Dynamic params → `generateStaticParams` (shell) or `<Suspense>` (stream)

If the set of params is enumerable, prerender them so `await params` resolves into the shell. Otherwise treat params as request-time and wrap consumers in `<Suspense>`.

```tsx
// ✅ option A — enumerate → params resolve into the shell, no Suspense needed for params
export function generateStaticParams() {
  return [{ slug: 'shoes' }, { slug: 'hats' }]
}
export default async function Page({ params }: PageProps<'/store/[slug]'>) {
  const { slug } = await params // known at build → shell-safe
  // ...
}
```

```tsx
// ✅ option B — not enumerable → params is request-time; await it inside a boundary (pattern #1)
```

Root params (the dynamic segments the root layout sits inside, e.g. `app/[lang]/layout.tsx`) are readable from any Server Component via `next/root-params` without prop-drilling — but under Cache Components they must still be enumerated by `generateStaticParams` (at least one value per root param) to land in the shell, the same as any other dynamic param.

**Insight:** [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime).

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

On a **client navigation** the router already has the URL, so a `useSearchParams()` consumer resolves synchronously and can appear in the prefetched shell — but you still need the boundary for the page-load path.

**Insight:** [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime) (or, via `useSearchParams` in a Client Component, [URL data in a Client Component](https://nextjs.org/docs/messages/blocking-prerender-client-hook)).

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

**Insight:** [`Date.now()`](https://nextjs.org/docs/messages/blocking-prerender-current-time), [`Math.random()`](https://nextjs.org/docs/messages/blocking-prerender-random), or [`crypto`](https://nextjs.org/docs/messages/blocking-prerender-crypto) while prerendering.

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

**Insight:** [runtime data in `generateMetadata()`](https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime).

---

## 8. Keep the LCP element in the shell

Don't bury the main heading (the LCP element) inside a boundary — it can't paint until the boundary resolves.

```tsx
// ✅ LCP outside the boundary → paints in the shell
<h1>{product.name}</h1>                 {/* shell (cache the name if needed) */}
<Suspense fallback={<Reviews.Skeleton />}>
  <Reviews productId={id} />            {/* streams */}
</Suspense>
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

**Insight:** the read's own insight surfaces on the client navigation when the boundary is too high — see [where to place the boundary](https://nextjs.org/docs/messages/blocking-prerender-dynamic#choosing-where-to-place-the-boundary).

## 10. URL data that can't move

Patterns 1–9 grow a **static shell** by moving dynamic reads behind boundaries. Session data from `cookies()` and `headers()` is handled by the earlier patterns. URL data is different: `params`, `searchParams`, and the full URL belong to one link, while the App Shell is shared by every link to the route.

If the whole route depends on URL data, pushing the read lower may leave no meaningful shared shell to commit. That is the optimizer's stop point, not another shell refactor. Return to `SKILL.md` after the optimization loop for the optional per-link-prefetch follow-up.

Per-link prefetching is the only way for this soft navigation to commit the
URL-specific content before the click. It has **three requirements**:

```tsx
// 1. The destination has adopted Partial Prefetching, either app-wide with
//    partialPrefetching: true or route-by-route with prefetch = 'partial'.

// 2. The navigation asks for a full prefetch — normally <Link prefetch={true}>.
//    A default/auto prefetch only warms the static shell.
<Link href={href} prefetch={true}>
  …
</Link>

// 3. The URL-dependent content is behind `use cache`, keyed by the resolved
//    params/searchParams/full URL value.
```

Under `instant()` the runtime entry is what commits, so the real content, not a skeleton, shows under the lock.

Gotchas (each cost real debugging time):

- **The full prefetch is mandatory.** With App Shells enabled an auto/PPR prefetch bails before the runtime spawn (`subtreeHasSpeculativePrefetch`); use `<Link prefetch={true}>` for normal links, or keep an existing manual full-prefetch abstraction if the app already owns one. If the route is still RED after caching the URL-dependent content, the navigation may still be doing an auto prefetch.
- **Partial Prefetching must be adopted for the destination.** Per-link prefetching uses the Partial Prefetching path. If the route is still RED after caching the URL-dependent content, check whether the link is still doing an auto prefetch or whether the destination never adopted Partial Prefetching.
- **Prefetch the canonical URL.** A link whose href 307-redirects (a `/foo` that canonicalizes to `/`) can't be prefetched — the prefetch receives the redirect, not the tree. Point the link and the prefetch at the final URL.
- **Don't blanket the full prefetch.** It fetches _all_ the target's dynamic data; enabling it for every visible link is wasteful. Scope `prefetch={true}` to the per-link-prefetch targets only, using the [trade-offs](https://nextjs.org/docs/app/guides/optimizing-prefetching#trade-offs) and [hover-triggered prefetch](https://nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch) when many links are visible.
- **Marker must be a committed node, not RSC bytes.** The content is often a client component, so its text isn't in the prefetch response — assert a `data-testid` that renders when the client subtree commits, not a substring of the stream.

Prefer a static shell (patterns 1–9) whenever the URL-data read can move: it's cheaper than a per-link prefetch and also covers hard load. Per-link prefetching is only for URL-data reads that genuinely can't move, or routes whose useful content is all URL-specific.

**Insight:** [dynamic data during prefetching](https://nextjs.org/docs/messages/instant-link-prefetch-partial).
