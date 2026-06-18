---
title: Migrating to Cache Components
nav_title: Migrating to Cache Components
description: Learn how to migrate from route segment configs to Cache Components in Next.js.
related:
  title: Next Steps
  description: Learn about other behavior changes when Cache Components is enabled.
  links:
    - app/getting-started/caching
    - app/guides/preserving-ui-state
    - app/api-reference/functions/generate-static-params
    - app/api-reference/config/next-config-js/cacheComponents
---

When [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled, route segment configs like `dynamic`, `revalidate`, and `fetchCache` are replaced by [`use cache`](/docs/app/api-reference/directives/use-cache) and [`cacheLife`](/docs/app/api-reference/functions/cacheLife).

Start by removing the route segment configs (`dynamic`, `revalidate`, `fetchCache`). With Cache Components enabled, Next.js surfaces uncached dynamic data as errors in development, naming the code to fix, most often uncached data to cache with [`use cache`](/docs/app/api-reference/directives/use-cache) or runtime data to wrap in [`<Suspense>`](https://react.dev/reference/react/Suspense).

Your existing `fetch` and `unstable_cache` caching keeps working as a separate layer, so let the errors guide what to change.

Some surfaces have their own steps:

- For routes with dynamic params, follow the [`generateStaticParams`](#generatestaticparams-and-dynamicparams) guidance.
- For metadata, follow the [`generateMetadata` and `generateViewport`](#generatemetadata-and-generateviewport) guidance.

The sections below cover each config and API and what to do with it under Cache Components.

## Enable Cache Components

Cache Components requires Next.js 16. If you're on Next.js 15 or earlier, upgrade first by following the [version 16 upgrade guide](/docs/app/guides/upgrading/version-16). Coming from an older version, work through the [upgrade guides](/docs/app/guides/upgrading) to reach 16 before continuing.

Then enable the [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) flag in `next.config.ts`:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

> **Good to know:** If you were using `experimental.dynamicIO` or `experimental.useCache`, `cacheComponents` replaces them. See the [version 16 upgrade guide](/docs/app/guides/upgrading/version-16#experimentaldynamicio-and-experimentalusecache).

## `dynamic = "force-dynamic"`

**Not needed.** All pages are dynamic by default.

```tsx filename="app/page.tsx" switcher
// Before - No longer needed
export const dynamic = 'force-dynamic'

export default function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before - No longer needed
export const dynamic = 'force-dynamic'

export default function Page() {
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
// After - Just remove it
export default function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - Just remove it
export default function Page() {
  return <div>...</div>
}
```

## `dynamic = "force-static"`

Start by removing it. When unhandled uncached or runtime data access is detected during development and build time, Next.js raises an error. Otherwise, the prerendering step automatically extracts the static HTML shell.

For uncached data access, add [`use cache`](/docs/app/api-reference/directives/use-cache) as close to the data access as possible with a long [`cacheLife`](/docs/app/api-reference/functions/cacheLife) like `'max'` to maintain cached behavior. If needed, add it at the top of the page or layout.

For runtime data access (`cookies()`, `headers()`, etc.), errors will direct you to wrap it with `<Suspense>`. Since you started by using `force-static`, you must remove the runtime data access to prevent any request time work.

```tsx filename="app/page.tsx" switcher
// Before
export const dynamic = 'force-static'

export default async function Page() {
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before
export const dynamic = 'force-static'

export default async function Page() {
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
import { cacheLife } from 'next/cache'

// After - Use 'use cache' instead
export default async function Page() {
  'use cache'
  cacheLife('max')
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
import { cacheLife } from 'next/cache'

// After - Use 'use cache' instead
export default async function Page() {
  'use cache'
  cacheLife('max')
  const data = await fetch('https://api.example.com/data')
  return <div>...</div>
}
```

## `revalidate`

**Replace with `cacheLife`.** Use the `cacheLife` function to define cache duration instead of the route segment config.

```tsx filename="app/page.tsx" switcher
// Before
export const revalidate = 3600 // 1 hour

export default async function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before
export const revalidate = 3600 // 1 hour

export default async function Page() {
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
// After - Use cacheLife
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('hours')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - Use cacheLife
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('hours')
  return <div>...</div>
}
```

## `fetchCache`

**Not needed.** With `use cache`, all data fetching within a cached scope is automatically cached, making `fetchCache` unnecessary.

```tsx filename="app/page.tsx" switcher
// Before
export const fetchCache = 'force-cache'
```

```jsx filename="app/page.js" switcher
// Before
export const fetchCache = 'force-cache'
```

```tsx filename="app/page.tsx" switcher
// After - Use 'use cache' to control caching behavior
export default async function Page() {
  'use cache'
  // All fetches here are cached
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - Use 'use cache' to control caching behavior
export default async function Page() {
  'use cache'
  // All fetches here are cached
  return <div>...</div>
}
```

## `fetch` cache options

**Move `cache` and `next` options to `use cache`.**

Without Cache Components, you cache a request with `cache: 'force-cache'` and tune it with `next: { revalidate, tags }`.

With Cache Components, wrap the fetch in a [`use cache`](/docs/app/api-reference/directives/use-cache) function. Fetches inside that scope are cached automatically, and `revalidate` and `tags` become [`cacheLife`](/docs/app/api-reference/functions/cacheLife) and [`cacheTag`](/docs/app/api-reference/functions/cacheTag).

```tsx filename="app/page.tsx" switcher
// Before
export default async function Page() {
  const res = await fetch('https://api.example.com/data', {
    cache: 'force-cache',
    next: { revalidate: 3600, tags: ['data'] },
  })
  const data = await res.json()
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before
export default async function Page() {
  const res = await fetch('https://api.example.com/data', {
    cache: 'force-cache',
    next: { revalidate: 3600, tags: ['data'] },
  })
  const data = await res.json()
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
// After
import { cacheLife, cacheTag } from 'next/cache'

async function getData() {
  'use cache'
  cacheLife('hours')
  cacheTag('data')
  const res = await fetch('https://api.example.com/data')
  return res.json()
}

export default async function Page() {
  const data = await getData()
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After
import { cacheLife, cacheTag } from 'next/cache'

async function getData() {
  'use cache'
  cacheLife('hours')
  cacheTag('data')
  const res = await fetch('https://api.example.com/data')
  return res.json()
}

export default async function Page() {
  const data = await getData()
  return <div>...</div>
}
```

Note the persistence difference. The `fetch` Data Cache persists cached responses across deployments and across serverless instances.

`use cache` defaults to in-memory storage, so its entries are discarded when the serverless instance is destroyed and are scoped to a single deployment. Use [`use cache: remote`](/docs/app/api-reference/directives/use-cache-remote) or a [cache handler](/docs/app/api-reference/config/next-config-js/cacheHandlers) for storage that survives instance teardown. Even with durable storage, expect cached values to recompute after a new deployment.

## `unstable_cache`

**Replace with `use cache`.**

`unstable_cache` is replaced by the [`use cache`](/docs/app/api-reference/directives/use-cache) directive.

Turn the wrapped function into a function with the `'use cache'` directive. The cache key is derived automatically from the arguments, so the key-parts array is no longer needed, and the `options` object maps to [`cacheLife`](/docs/app/api-reference/functions/cacheLife) and [`cacheTag`](/docs/app/api-reference/functions/cacheTag).

```tsx filename="app/lib/data.ts" switcher
// Before
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'

export const getUser = unstable_cache(
  async (id: string) => {
    return db.query.users.findFirst({ where: eq(users.id, id) })
  },
  ['user'], // cache key prefix
  { tags: ['users'], revalidate: 3600 }
)
```

```js filename="app/lib/data.js" switcher
// Before
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'

export const getUser = unstable_cache(
  async (id) => {
    return db.query.users.findFirst({ where: eq(users.id, id) })
  },
  ['user'], // cache key prefix
  { tags: ['users'], revalidate: 3600 }
)
```

```tsx filename="app/lib/data.ts" switcher
// After
import { cacheLife, cacheTag } from 'next/cache'
import { db } from '@/lib/db'

export async function getUser(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('users')
  return db.query.users.findFirst({ where: eq(users.id, id) })
}
```

```js filename="app/lib/data.js" switcher
// After
import { cacheLife, cacheTag } from 'next/cache'
import { db } from '@/lib/db'

export async function getUser(id) {
  'use cache'
  cacheLife('hours')
  cacheTag('users')
  return db.query.users.findFirst({ where: eq(users.id, id) })
}
```

Like the `fetch` Data Cache, `unstable_cache` persists cached values across deployments and serverless instances, while `use cache` does not. See [`fetch` cache options](#fetch-cache-options) above for the storage details.

## On-demand revalidation (`revalidateTag`, `revalidatePath`, `updateTag`)

On-demand invalidation still works by tagging cached data and expiring it after an event. Tag data with [`cacheTag`](/docs/app/api-reference/functions/cacheTag) inside a `use cache` function instead of the `fetch` `next.tags` option, then choose the invalidation API by the behavior you want:

- [`updateTag`](/docs/app/api-reference/functions/updateTag): for mutations whose result the user must see immediately (read-your-own-writes). Called from a Server Action, it expires the tag so the next request waits for fresh data instead of serving stale content.
- [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag): for stale-while-revalidate. Pass a cache profile like `'max'` to serve cached data while it refreshes in the background. Works in Server Actions and Route Handlers.
- [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath): unchanged from the previous caching model.

`updateTag` isn't exclusive to Cache Components (it also works with the previous caching model), but migrating is a good time to adopt it. After a mutation in a Server Action, reach for it when the user should see their own change right away.

```tsx filename="app/actions.ts" switcher
'use server'
import { updateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  // Create the post, then show it immediately on the next request
  updateTag('posts')
}
```

```js filename="app/actions.js" switcher
'use server'
import { updateTag } from 'next/cache'

export async function createPost(formData) {
  // Create the post, then show it immediately on the next request
  updateTag('posts')
}
```

> **Good to know:** `updateTag` can only be called from a Server Action; calling it elsewhere throws. In Route Handlers or webhooks, use `revalidateTag` instead.

## `unstable_noStore`

**Not needed.** `unstable_noStore` (`noStore()`) opts a component out of caching. With Cache Components, nothing is cached unless you add `use cache`, so you can remove it. If a component must run at request time, call [`connection()`](/docs/app/api-reference/functions/connection) before the work and wrap it in `<Suspense>`.

```tsx filename="app/page.tsx" switcher
// Before
import { unstable_noStore as noStore } from 'next/cache'

export default async function Page() {
  noStore()
  const data = await db.query('...')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before
import { unstable_noStore as noStore } from 'next/cache'

export default async function Page() {
  noStore()
  const data = await db.query('...')
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
// After - uncached by default, just remove noStore()
export default async function Page() {
  const data = await db.query('...')
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - uncached by default, just remove noStore()
export default async function Page() {
  const data = await db.query('...')
  return <div>...</div>
}
```

## `generateStaticParams` and `dynamicParams`

One behavior changes for [dynamic routes](/docs/app/api-reference/file-conventions/dynamic-routes) when Cache Components is enabled.

### `generateStaticParams` must return at least one param

**Returning an empty array now errors.** Without Cache Components, returning `[]` defers every path to the first runtime visit. With Cache Components, [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params) must return at least one param so Next.js can prerender the route. An empty array raises [`empty-generate-static-params`](/docs/messages/empty-generate-static-params).

```tsx filename="app/blog/[slug]/page.tsx" switcher
// Before - defer all paths to runtime
export async function generateStaticParams() {
  return []
}
```

```jsx filename="app/blog/[slug]/page.js" switcher
// Before - defer all paths to runtime
export async function generateStaticParams() {
  return []
}
```

```tsx filename="app/blog/[slug]/page.tsx" switcher
// After - return at least one param to prerender
export async function generateStaticParams() {
  const posts = await fetch('https://.../posts').then((res) => res.json())
  return posts.slice(0, 1).map((post) => ({ slug: post.slug }))
}
```

```jsx filename="app/blog/[slug]/page.js" switcher
// After - return at least one param to prerender
export async function generateStaticParams() {
  const posts = await fetch('https://.../posts').then((res) => res.json())
  return posts.slice(0, 1).map((post) => ({ slug: post.slug }))
}
```

## `cookies`, `headers`, and `searchParams`

**Wrap runtime data access in `<Suspense>`.** Without Cache Components, reading [`cookies()`](/docs/app/api-reference/functions/cookies), [`headers()`](/docs/app/api-reference/functions/headers), or [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional) opts the whole route into dynamic rendering. With Cache Components, accessing them outside a [`<Suspense>`](https://react.dev/reference/react/Suspense) boundary surfaces the [**blocking-route** insight](/docs/messages/blocking-route). Move the access into a component wrapped in `<Suspense>` so the rest of the page prerenders as a static shell and the dynamic part streams in at request time.

```tsx filename="app/page.tsx" switcher
import { cookies } from 'next/headers'

// Before - reading cookies at the top makes the whole route dynamic
export default async function Page() {
  const theme = (await cookies()).get('theme')?.value
  return <Dashboard theme={theme} />
}
```

```jsx filename="app/page.js" switcher
import { cookies } from 'next/headers'

// Before - reading cookies at the top makes the whole route dynamic
export default async function Page() {
  const theme = (await cookies()).get('theme')?.value
  return <Dashboard theme={theme} />
}
```

```tsx filename="app/page.tsx" switcher
import { cookies } from 'next/headers'
import { Suspense } from 'react'

// After - the page prerenders; only Dashboard streams at request time
export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Dashboard />
    </Suspense>
  )
}

async function Dashboard() {
  const theme = (await cookies()).get('theme')?.value
  // ...
}
```

```jsx filename="app/page.js" switcher
import { cookies } from 'next/headers'
import { Suspense } from 'react'

// After - the page prerenders; only Dashboard streams at request time
export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Dashboard />
    </Suspense>
  )
}

async function Dashboard() {
  const theme = (await cookies()).get('theme')?.value
  // ...
}
```

Your page receives `params` and `searchParams` as props, and both are promises. Apply the same pattern: pass the promise straight through to the `<Suspense>`-wrapped component as a prop and `await` it there, rather than at the top of the page. You can also unwrap the promise inline with `.then()` and pass a plain value down; see [Streaming](/docs/app/guides/streaming#push-dynamic-access-down) for a similar pattern.

```tsx filename="app/page.tsx" switcher
import { Suspense } from 'react'

export default function Page({ searchParams }: PageProps<'/'>) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Results searchParams={searchParams} />
    </Suspense>
  )
}

async function Results({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const { query } = await searchParams
  // ...
}
```

```jsx filename="app/page.js" switcher
import { Suspense } from 'react'

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Results searchParams={searchParams} />
    </Suspense>
  )
}

async function Results({ searchParams }) {
  const { query } = await searchParams
  // ...
}
```

## Route Handlers (`GET`)

**Replace `dynamic = 'force-static'` with `use cache`.**

Without Cache Components, a `GET` [Route Handler](/docs/app/api-reference/file-conventions/route) is dynamic unless you opt into caching with `export const dynamic = 'force-static'`. With Cache Components, `GET` handlers follow the same model as pages: they prerender when they don't access uncached or runtime data, and you cache uncached data with `use cache`. Remove the `dynamic` config and move the data access into a separate function marked with `use cache`. The directive can't be applied to the `GET` export itself, so the handler calls a cached helper.

```ts filename="app/api/products/route.ts" switcher
// Before
export const dynamic = 'force-static'

export async function GET() {
  const products = await db.query('SELECT * FROM products')
  return Response.json(products)
}
```

```js filename="app/api/products/route.js" switcher
// Before
export const dynamic = 'force-static'

export async function GET() {
  const products = await db.query('SELECT * FROM products')
  return Response.json(products)
}
```

```ts filename="app/api/products/route.ts" switcher
// After
import { cacheLife } from 'next/cache'

export async function GET() {
  const products = await getProducts()
  return Response.json(products)
}

async function getProducts() {
  'use cache'
  cacheLife('hours')
  return db.query('SELECT * FROM products')
}
```

```js filename="app/api/products/route.js" switcher
// After
import { cacheLife } from 'next/cache'

export async function GET() {
  const products = await getProducts()
  return Response.json(products)
}

async function getProducts() {
  'use cache'
  cacheLife('hours')
  return db.query('SELECT * FROM products')
}
```

> **Good to know:** Reading uncached or runtime data in a `GET` handler bails out of prerendering by **throwing**. A `try/catch` you already have around other operations will catch that bail-out. If the `catch` block logs the error, it adds noise to the build output. Set `experimental.hideLogsAfterAbort: true` to hide logs emitted after a bail-out.

## `generateMetadata` and `generateViewport`

**Cache external data with `use cache`, or mark intentionally dynamic pages.** Under Cache Components, [`generateMetadata`](/docs/app/api-reference/functions/generate-metadata) and [`generateViewport`](/docs/app/api-reference/functions/generate-viewport) follow the same rules as components. If they read runtime data (`cookies()`, `headers()`, `params`, `searchParams`) or fetch uncached data while the rest of the page is otherwise prerenderable, Next.js raises an error so the choice is explicit. If the metadata depends on external but not runtime data, add `use cache`.

```tsx filename="app/page.tsx" switcher
// Before
export async function generateMetadata() {
  const { title, description } = await db.query('site-metadata')
  return { title, description }
}
```

```tsx filename="app/page.tsx" switcher
// After - cache external data
export async function generateMetadata() {
  'use cache'
  const { title, description } = await db.query('site-metadata')
  return { title, description }
}
```

If the metadata genuinely needs runtime data, you can't wrap `generateMetadata` in `<Suspense>`. Instead, add a dynamic marker component to the page so the static content still prerenders while the metadata streams in.

```tsx filename="app/page.tsx" switcher
import { Suspense } from 'react'
import { connection } from 'next/server'

export async function generateMetadata() {
  // reads runtime data
  return { title: 'Personalized Title' }
}

async function DynamicMarker() {
  return (
    <Suspense>
      <Connection />
    </Suspense>
  )
}

async function Connection() {
  await connection()
  return null
}

export default function Page() {
  return (
    <>
      <article>Static content</article>
      <DynamicMarker />
    </>
  )
}
```

See [`generateMetadata` with Cache Components](/docs/app/api-reference/functions/generate-metadata#with-cache-components) and [`generateViewport` with Cache Components](/docs/app/api-reference/functions/generate-viewport#with-cache-components) for the full set of fix options and trade-offs.

## `runtime = 'edge'`

**Not supported.** Cache Components requires the Node.js runtime. Switch to the Node.js runtime (the default) by removing the `runtime = 'edge'` export. If you need edge behavior for specific routes, use [Proxy](/docs/app/api-reference/file-conventions/proxy) instead.

## `experimental_ppr`

**Removed. Enable `cacheComponents` instead.** Next.js 16 removes the experimental Partial Prerendering flag (`experimental.ppr`) and the `experimental_ppr` route segment config. Partial Prerendering is now part of [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents), so remove `experimental.ppr` from `next.config` and `experimental_ppr` from your segments. A [codemod](/docs/app/guides/upgrading/codemods#remove-experimental_ppr-route-segment-config-from-app-router-pages-and-layouts) removes the segment config for you.

```tsx filename="app/page.tsx" switcher
// Before - no longer needed
export const experimental_ppr = true

export default function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// Before - no longer needed
export const experimental_ppr = true

export default function Page() {
  return <div>...</div>
}
```

```tsx filename="app/page.tsx" switcher
// After - remove it; cacheComponents enables Partial Prerendering
export default function Page() {
  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
// After - remove it; cacheComponents enables Partial Prerendering
export default function Page() {
  return <div>...</div>
}
```

## UI state preservation

**Component state now persists across navigations.** With Cache Components, Next.js preserves routes using React's [`<Activity>`](https://react.dev/reference/react/Activity) component in [`"hidden"`](https://react.dev/reference/react/Activity#activity) mode instead of unmounting them. Effects clean up and re-run normally, but `useState` values, form inputs, and scroll position are no longer reset when navigating away and back.

If your code relied on unmounting to clear state, you may need to add explicit reset logic:

- **Dropdowns and popovers**: stay open when navigating back. Close them in a `useLayoutEffect` cleanup function.
- **Dialogs with initialization logic**: Effects that depend on dialog state (like focusing an input) won't re-fire if the state was preserved. Derive dialog state from the URL instead.
- **Forms after submission**: input values and `useActionState` results (success/error messages) persist when returning. Reset in the submit handler or user action when possible, otherwise use a cleanup effect.

See [Preserving UI state across navigations](/docs/app/guides/preserving-ui-state) for detailed examples of each pattern.
