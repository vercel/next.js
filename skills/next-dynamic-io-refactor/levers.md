# Levers — before → after

Four levers solve every dynamic-IO site. Each recipe keeps the maximum in the
prerendered shell and isolates only genuinely per-request work. Pick the lever
from the framework's questions (`SKILL.md`); confirm the site first
(`analysis.md`).

The two structural moves — **root param + `generateStaticParams`** and **pass
the promise down** — are levers 4 and 1. **`'use cache'`** is lever 3. **Fallback
decomposition** is lever 5. They compose: push down to lift static structure,
then cache or stream what's left.

---

## Lever 1 — Pass the promise down (push the `await` into a Suspense child)

The answer to _"can it be pushed down? can we pass only the promise down?"_ — and
the single most common fix. Awaiting at the top of a page/layout makes
**everything below** dynamic.

```tsx
// ⛔ before — top-level await gates the whole component
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
// ✅ after — pass the UNRESOLVED promise down; await it in a Suspense child
import { Suspense } from 'react'

export default function Page(props: PageProps<'/store/[slug]'>) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
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

Unwrap with `use()` instead of `await` when the consumer is a Client Component:

```tsx
'use client'
import { use } from 'react'
function Product({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  // ...
}
```

**Layout variant — start the read, don't await it, pass the promise:**

```tsx
// ✅ {children} and <nav> stay in the shell; only <UserMenu> streams
import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default function Layout({ children }: { children: React.ReactNode }) {
  const cookiePromise = cookies() // started, NOT awaited → does not block
  return (
    <body>
      <nav>
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu cookiePromise={cookiePromise} />
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

> A `React.cache`/memo wrapper around `cookies()`/`headers()` does **not** make it
> shell-safe — the underlying request read still hangs in prerender. Only pushing
> it behind `<Suspense>` (or, for shared data, `'use cache'`) works.

---

## Lever 2 — Defer an auth gate / side-effect `await`

A top-level `await` whose job is to gate or redirect (not to render data). Render
`children` unconditionally; move the gate into a `<Suspense fallback={null}>`
child. The shell builds **as if authorized**; the read hangs in prerender so the
`redirect()` only fires at request-time resume.

```tsx
// ⛔ before — gates the whole frame out of the shell
export default async function SettingsLayout({ children }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  return <Shell>{children}</Shell>
}
```

```tsx
// ✅ after — frame is in the shell; the gate streams
import { Suspense } from 'react'
export default function SettingsLayout({ children }) {
  return (
    <Shell>
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      {children}
    </Shell>
  )
}
async function AuthGate() {
  const session = await getServerSession()
  if (!session?.user) redirect('/login') // only runs at request-time resume
  return null
}
```

`fallback={null}` is correct **only because** `AuthGate` renders nothing on
success. For data, use a real skeleton (lever 5).

---

## Lever 3 — `'use cache'` (shared, stable data joins the shell)

The answer to _"is this the same for everyone?"_ — yes → cache it, and it
prerenders into the shell with no boundary needed.

```tsx
// ⛔ before — uncached read blocks the shell
const product = await db.products.findBySlug(slug)
```

```tsx
// ✅ after — cached → resolved at prerender, lands in the shell
import { cacheLife, cacheTag } from 'next/cache'

async function getProduct(slug: string) {
  'use cache' // MUST be the first statement; function MUST be async
  cacheTag('products', `product-${slug}`)
  cacheLife('hours') // ask the user for freshness → map to a profile
  return db.products.findBySlug(slug)
}
```

Rules: async only; `'use cache'` first; arguments + return value serializable;
**no `cookies()`/`headers()`/`searchParams` inside**. Profile expiry `< 300s`
(e.g. `'seconds'`) is treated as dynamic and stays out of the shell — use
`'minutes'`+ for shell content. Decide per data source: cache the stable read,
leave the must-be-fresh read behind a boundary (lever 1).

---

## Lever 4 — Root param + `generateStaticParams`

The answer to the first "how to solve dynamic IO" move. If the dynamic value's
set is enumerable, make it a (root) param and enumerate it — `await params` then
resolves at build into the shell, no boundary needed for the param.

```tsx
// ✅ enumerate → params are build-known → shell-safe
export async function generateStaticParams() {
  const slugs = await getAllSlugs()
  return slugs.map((slug) => ({ slug })) // ≥1 entry required under Cache Components
}
export default async function Page({ params }: PageProps<'/store/[slug]'>) {
  const { slug } = await params // known at build
  // ...
}
```

- **Root params** (segments the root layout sits inside, e.g. `app/[lang]/...`)
  are readable anywhere via `import { lang } from 'next/root-params'` — no
  prop-drilling — but still need ≥1 `generateStaticParams` value to land in the
  shell.
- Partial params create **reusable subshells**: enumerating `[category]` lets
  `/[category]/[slug]` serve a category shell instantly for _any_ slug, with the
  product streaming. Put a `<Suspense>` in the `[category]/layout.tsx` around
  `{children}` to mint that subshell boundary.
- **Not enumerable** (user/team namespace, unbounded) → don't force gsp; treat
  the param as request-time and use lever 1 (pass the promise down behind a
  boundary). On a hard load such a route has no static shell — that's a framework
  constraint, not a fixable bug.

---

## Lever 5 — Granular fallback decomposition

The answer to _"is the fallback granular enough? can it be decomposed?"_ Push the
boundary **down to the I/O** so static chrome renders once in the shell and each
read streams independently.

```tsx
// ⛔ before — one coarse boundary (or loading.tsx) re-creates the chrome and
//            throws the whole subtree out of the shell
function Layout({ children }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}
```

```tsx
// ✅ after — chrome in the shell; only each data read sits behind a boundary
function List() {
  return (
    <>
      <Search /> {/* sync → shell */}
      <NewButton /> {/* sync → shell */}
      <Suspense fallback={<RowsSkeleton />}>
        <Rows /> {/* the only I/O → streams, reusing its own skeleton */}
      </Suspense>
    </>
  )
}
```

- **Litmus test:** if an element renders in _both_ the fallback and the resolved
  tree, you've recreated the shell — hoist it _above_ the boundary.
- **Reuse, don't rebuild.** A boundary's fallback should be the component's _own_
  existing loading design (an exported `*Skeleton`, its `loading.tsx`, the
  fallback already inside its `<Suspense>`). Never hand-build a skeleton that
  mirrors the page layout — it drifts and pulls you back to one coarse boundary.
- **`loading.tsx` is the coarsest boundary** (suspends the whole segment). If the
  segment is mostly static, replace it with per-region `<Suspense>` in the page
  and delete/shrink `loading.tsx`. Keep `loading.tsx` only when the entire
  segment genuinely depends on one request.
- **Keep the LCP element in the shell** — don't bury the hero/heading inside a
  boundary; it can't paint until the boundary resolves. Cache its data if needed.

---

## Special cases

- **`searchParams`** — never build-known; always behind `<Suspense>` on page
  load. Isolate the consumer so the rest of the page stays in the shell.
- **`generateMetadata` / `generateViewport`** reading request data — fix with a
  static `export const metadata`/`viewport`, or wrap the body in `'use cache'`
  (NOT `<Suspense>`). A dynamic viewport blocks the whole page; the escape hatch
  is `export const unstable_instant = false`.
- **Nondeterministic values** — per-request → `await connection()` then read,
  behind `<Suspense>`; fixed-for-build → `'use cache'`.
- **Don't use `export const dynamic` / `export const revalidate`** — deprecated
  under Cache Components; these levers replace them.
