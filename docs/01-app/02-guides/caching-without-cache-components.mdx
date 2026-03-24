---
title: Caching and Revalidating (Previous Model)
nav_title: Caching (Previous Model)
description: Learn how to cache and revalidate data using fetch options, unstable_cache, and route segment configs for projects not using Cache Components.
---

> This guide assumes you are **not** using [Cache Components](/docs/app/getting-started/caching) which was introduced in version 16 under the [`cacheComponents` flag](/docs/app/api-reference/config/next-config-js/cacheComponents).

## Caching `fetch` requests

By default, [`fetch`](/docs/app/api-reference/functions/fetch) requests are not cached. You can cache individual requests by setting the `cache` option to `'force-cache'`.

```tsx filename="app/page.tsx" switcher
export default async function Page() {
  const data = await fetch('https://...', { cache: 'force-cache' })
}
```

```jsx filename="app/page.jsx" switcher
export default async function Page() {
  const data = await fetch('https://...', { cache: 'force-cache' })
}
```

See the [`fetch` API reference](/docs/app/api-reference/functions/fetch) to learn more.

### `unstable_cache` for non-`fetch` functions

`unstable_cache` allows you to cache the result of database queries and other async functions that don't use `fetch`. Wrap `unstable_cache` around the function:

```ts filename="app/lib/data.ts" switcher
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'

export const getCachedUser = unstable_cache(
  async (id: string) => {
    return db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .then((res) => res[0])
  },
  ['user'], // cache key prefix
  {
    tags: ['user'],
    revalidate: 3600,
  }
)
```

```js filename="app/lib/data.js" switcher
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'

export const getCachedUser = unstable_cache(
  async (id) => {
    return db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .then((res) => res[0])
  },
  ['user'], // cache key prefix
  {
    tags: ['user'],
    revalidate: 3600,
  }
)
```

The third argument accepts:

- `tags`: an array of tags for on-demand revalidation with `revalidateTag`.
- `revalidate`: the number of seconds before the cache is revalidated.

See the [`unstable_cache` API reference](/docs/app/api-reference/functions/unstable_cache) to learn more.

### Route segment config

You can configure caching behavior at the route level by exporting config options from a [Page](/docs/app/api-reference/file-conventions/page), [Layout](/docs/app/api-reference/file-conventions/layout), or [Route Handler](/docs/app/api-reference/file-conventions/route).

#### `dynamic`

Change the dynamic behavior of a layout or page to fully static or fully dynamic.

```tsx filename="layout.tsx | page.tsx | route.ts" switcher
export const dynamic = 'auto'
// 'auto' | 'force-dynamic' | 'error' | 'force-static'
```

```jsx filename="layout.js | page.js | route.js" switcher
export const dynamic = 'auto'
// 'auto' | 'force-dynamic' | 'error' | 'force-static'
```

- **`'auto'`** (default): The default option to cache as much as possible without preventing any components from opting into dynamic behavior.
- **`'force-dynamic'`**: Force [dynamic rendering](/docs/app/glossary#dynamic-rendering), which will result in routes being rendered for each user at request time. This option is equivalent to:
  - Setting the option of every `fetch()` request in a layout or page to `{ cache: 'no-store', next: { revalidate: 0 } }`.
  - Setting the segment config to `export const fetchCache = 'force-no-store'`
- **`'error'`**: Force prerendering and cache the data of a layout or page by causing an error if any components use Request-time APIs or uncached data. This option is equivalent to:
  - `getStaticProps()` in the `pages` directory.
  - Setting the option of every `fetch()` request in a layout or page to `{ cache: 'force-cache' }`.
  - Setting the segment config to `fetchCache = 'only-cache'`.
- **`'force-static'`**: Force prerendering and cache the data of a layout or page by forcing [`cookies`](/docs/app/api-reference/functions/cookies), [`headers()`](/docs/app/api-reference/functions/headers) and [`useSearchParams()`](/docs/app/api-reference/functions/use-search-params) to return empty values. It is possible to [`revalidate`](#route-segment-config-revalidate), [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath), or [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag), in pages or layouts rendered with `force-static`.

#### `fetchCache`

<details>
  <summary>This is an advanced option that should only be used if you specifically need to override the default behavior.</summary>

By default, Next.js **will cache** any `fetch()` requests that are reachable **before** any Request-time APIs are used and **will not cache** `fetch` requests that are discovered **after** Request-time APIs are used.

`fetchCache` allows you to override the default `cache` option of all `fetch` requests in a layout or page.

```tsx filename="layout.tsx | page.tsx | route.ts" switcher
export const fetchCache = 'auto'
// 'auto' | 'default-cache' | 'only-cache'
// 'force-cache' | 'force-no-store' | 'default-no-store' | 'only-no-store'
```

```jsx filename="layout.js | page.js | route.js" switcher
export const fetchCache = 'auto'
// 'auto' | 'default-cache' | 'only-cache'
// 'force-cache' | 'force-no-store' | 'default-no-store' | 'only-no-store'
```

- **`'auto'`** (default): The default option to cache `fetch` requests before Request-time APIs with the `cache` option they provide and not cache `fetch` requests after Request-time APIs.
- **`'default-cache'`**: Allow any `cache` option to be passed to `fetch` but if no option is provided then set the `cache` option to `'force-cache'`. This means that even `fetch` requests after Request-time APIs are considered static.
- **`'only-cache'`**: Ensure all `fetch` requests opt into caching by changing the default to `cache: 'force-cache'` if no option is provided and causing an error if any `fetch` requests use `cache: 'no-store'`.
- **`'force-cache'`**: Ensure all `fetch` requests opt into caching by setting the `cache` option of all `fetch` requests to `'force-cache'`.
- **`'default-no-store'`**: Allow any `cache` option to be passed to `fetch` but if no option is provided then set the `cache` option to `'no-store'`. This means that even `fetch` requests before Request-time APIs are considered dynamic.
- **`'only-no-store'`**: Ensure all `fetch` requests opt out of caching by changing the default to `cache: 'no-store'` if no option is provided and causing an error if any `fetch` requests use `cache: 'force-cache'`
- **`'force-no-store'`**: Ensure all `fetch` requests opt out of caching by setting the `cache` option of all `fetch` requests to `'no-store'`. This forces all `fetch` requests to be re-fetched every request even if they provide a `'force-cache'` option.

##### Cross-route segment behavior

- Any options set across each layout and page of a single route need to be compatible with each other.
  - If both the `'only-cache'` and `'force-cache'` are provided, then `'force-cache'` wins. If both `'only-no-store'` and `'force-no-store'` are provided, then `'force-no-store'` wins. The force option changes the behavior across the route so a single segment with `'force-*'` would prevent any errors caused by `'only-*'`.
  - The intention of the `'only-*'` and `'force-*'` options is to guarantee the whole route is either fully static or fully dynamic. This means:
    - A combination of `'only-cache'` and `'only-no-store'` in a single route is not allowed.
    - A combination of `'force-cache'` and `'force-no-store'` in a single route is not allowed.
  - A parent cannot provide `'default-no-store'` if a child provides `'auto'` or `'*-cache'` since that could make the same fetch have different behavior.
- It is generally recommended to leave shared parent layouts as `'auto'` and customize the options where child segments diverge.

</details>

## Time-based revalidation

Use the `next.revalidate` option on `fetch` to revalidate data after a specified number of seconds:

```tsx filename="app/page.tsx" switcher
export default async function Page() {
  const data = await fetch('https://...', { next: { revalidate: 3600 } })
}
```

```jsx filename="app/page.jsx" switcher
export default async function Page() {
  const data = await fetch('https://...', { next: { revalidate: 3600 } })
}
```

For non-`fetch` functions, `unstable_cache` accepts a `revalidate` option in its configuration (see [example above](#unstable_cache-for-non-fetch-functions)).

### Route segment config `revalidate`

Set the default revalidation time for a layout or page. This option does not override the `revalidate` value set by individual `fetch` requests.

```tsx filename="layout.tsx | page.tsx | route.ts" switcher
export const revalidate = false
// false | 0 | number
```

```jsx filename="layout.js | page.js | route.js" switcher
export const revalidate = false
// false | 0 | number
```

- **`false`** (default): The default heuristic to cache any `fetch` requests that set their `cache` option to `'force-cache'` or are discovered before a Request-time API is used. Semantically equivalent to `revalidate: Infinity` which effectively means the resource should be cached indefinitely. It is still possible for individual `fetch` requests to use `cache: 'no-store'` or `revalidate: 0` to avoid being cached and make the route dynamically rendered. Or set `revalidate` to a positive number lower than the route default to increase the revalidation frequency of a route.
- **`0`**: Ensure a layout or page is always dynamically rendered even if no Request-time APIs or uncached data fetches are discovered. This option changes the default of `fetch` requests that do not set a `cache` option to `'no-store'` but leaves `fetch` requests that opt into `'force-cache'` or use a positive `revalidate` as is.
- **`number`**: (in seconds) Set the default revalidation frequency of a layout or page to `n` seconds.

> **Good to know**:
>
> - The revalidate value needs to be statically analyzable. For example `revalidate = 600` is valid, but `revalidate = 60 * 10` is not.
> - The revalidate value is not available when using `runtime = 'edge'`.
> - In Development, Pages are _always_ rendered on-demand and are never cached. This allows you to see changes immediately without waiting for a revalidation period to pass.

#### Revalidation frequency

- The lowest `revalidate` across each layout and page of a single route will determine the revalidation frequency of the _entire_ route. This ensures that child pages are revalidated as frequently as their parent layouts.
- Individual `fetch` requests can set a lower `revalidate` than the route's default `revalidate` to increase the revalidation frequency of the entire route. This allows you to dynamically opt-in to more frequent revalidation for certain routes based on some criteria.

## On-demand revalidation

To revalidate cached data after an event, use [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) or [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath) in a [Server Action](/docs/app/getting-started/mutating-data) or [Route Handler](/docs/app/api-reference/file-conventions/route).

### Tagging cached data

Tag `fetch` requests with `next.tags` to enable on-demand cache invalidation:

```tsx filename="app/lib/data.ts" switcher
export async function getUserById(id: string) {
  const data = await fetch(`https://...`, {
    next: { tags: ['user'] },
  })
}
```

```jsx filename="app/lib/data.js" switcher
export async function getUserById(id) {
  const data = await fetch(`https://...`, {
    next: { tags: ['user'] },
  })
}
```

For non-`fetch` functions, `unstable_cache` also accepts a `tags` option (see [example above](#unstable_cache-for-non-fetch-functions)).

### `revalidateTag`

Invalidate cached data by tag using [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag):

```tsx filename="app/lib/actions.ts" switcher
import { revalidateTag } from 'next/cache'

export async function updateUser(id: string) {
  // Mutate data
  revalidateTag('user')
}
```

```jsx filename="app/lib/actions.js" switcher
import { revalidateTag } from 'next/cache'

export async function updateUser(id) {
  // Mutate data
  revalidateTag('user')
}
```

### `revalidatePath`

Invalidate all cached data for a specific route path using [`revalidatePath`](/docs/app/api-reference/functions/revalidatePath):

```tsx filename="app/lib/actions.ts" switcher
import { revalidatePath } from 'next/cache'

export async function updateUser(id: string) {
  // Mutate data
  revalidatePath('/profile')
}
```

```jsx filename="app/lib/actions.js" switcher
import { revalidatePath } from 'next/cache'

export async function updateUser(id) {
  // Mutate data
  revalidatePath('/profile')
}
```

## Deduplicating requests

If you are not using `fetch` (which is [automatically memoized](/docs/app/api-reference/functions/fetch#memoization)), and instead using an ORM or database directly, you can wrap your data access with the [React `cache`](https://react.dev/reference/react/cache) function to deduplicate requests within a single render pass:

```tsx filename="app/lib/data.ts" switcher
import { cache } from 'react'
import { db, posts, eq } from '@/lib/db'

export const getPost = cache(async (id: string) => {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, parseInt(id)),
  })
})
```

```jsx filename="app/lib/data.js" switcher
import { cache } from 'react'
import { db, posts, eq } from '@/lib/db'

export const getPost = cache(async (id) => {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, parseInt(id)),
  })
})
```

## Preloading data

You can preload data by creating a utility function that you eagerly call above blocking requests. This lets you initiate data fetching early, so the data is already available by the time the component renders.

Combine the [`server-only` package](https://www.npmjs.com/package/server-only) with React's [`cache`](https://react.dev/reference/react/cache) to create a reusable preload utility:

```ts filename="utils/get-item.ts" switcher
import { cache } from 'react'
import 'server-only'

export const getItem = cache(async (id: string) => {
  // ...
})

export const preload = (id: string) => {
  void getItem(id)
}
```

```js filename="utils/get-item.js" switcher
import { cache } from 'react'
import 'server-only'

export const getItem = cache(async (id) => {
  // ...
})

export const preload = (id) => {
  void getItem(id)
}
```

Then call `preload()` before any blocking work so the data starts loading immediately:

```tsx filename="app/item/[id]/page.tsx" switcher
import { getItem, preload, checkIsAvailable } from '@/lib/data'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Start loading item data
  preload(id)
  // Perform another asynchronous task
  const isAvailable = await checkIsAvailable()

  return isAvailable ? <Item id={id} /> : null
}

async function Item({ id }: { id: string }) {
  const result = await getItem(id)
  // ...
}
```

```jsx filename="app/item/[id]/page.js" switcher
import { getItem, preload, checkIsAvailable } from '@/lib/data'

export default async function Page({ params }) {
  const { id } = await params
  // Start loading item data
  preload(id)
  // Perform another asynchronous task
  const isAvailable = await checkIsAvailable()

  return isAvailable ? <Item id={id} /> : null
}

async function Item({ id }) {
  const result = await getItem(id)
  // ...
}
```
