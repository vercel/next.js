---
title: fetch
description: API reference for the extended fetch function.
---

Next.js extends the native [Web `fetch()` API](https://developer.mozilla.org/docs/Web/API/Fetch_API) to allow each request on the server to set its own persistent caching semantics.

In the browser, the `cache` option indicates how a fetch request will interact with the _browser's_ HTTP cache. With this extension, `cache` indicates how a _server-side_ fetch request will interact with the framework's persistent HTTP cache.

You can call `fetch` with `async` and `await` directly within Server Components.

```tsx filename="app/page.tsx" switcher
export default async function Page() {
  // This request should be cached until manually invalidated.
  // Similar to `getStaticProps`.
  // `force-cache` is the default and can be omitted.
  const staticData = await fetch(`https://...`, { cache: 'force-cache' })

  // This request should be refetched on every request.
  // Similar to `getServerSideProps`.
  const dynamicData = await fetch(`https://...`, { cache: 'no-store' })

  // This request should be cached with a lifetime of 10 seconds.
  // Similar to `getStaticProps` with the `revalidate` option.
  const revalidatedData = await fetch(`https://...`, {
    next: { revalidate: 10 },
  })

  return <div>...</div>
}
```

```jsx filename="app/page.js" switcher
export default async function Page() {
  // This request should be cached until manually invalidated.
  // Similar to `getStaticProps`.
  // `force-cache` is the default and can be omitted.
  const staticData = await fetch(`https://...`, { cache: 'force-cache' })

  // This request should be refetched on every request.
  // Similar to `getServerSideProps`.
  const dynamicData = await fetch(`https://...`, { cache: 'no-store' })

  // This request should be cached with a lifetime of 10 seconds.
  // Similar to `getStaticProps` with the `revalidate` option.
  const revalidatedData = await fetch(`https://...`, {
    next: { revalidate: 10 },
  })

  return <div>...</div>
}
```

## `fetch(url, options)`

Since Next.js extends the [Web `fetch()` API](https://developer.mozilla.org/docs/Web/API/Fetch_API), you can use any of the [native options available](https://developer.mozilla.org/docs/Web/API/fetch#parameters).

### `options.cache`

Configure how the request should interact with Next.js [Data Cache](/docs/app/building-your-application/caching#data-cache).

```ts
fetch(`https://...`, { cache: 'force-cache' | 'no-store' })
```

- **`force-cache`** (default) - Next.js looks for a matching request in its Data Cache.
  - If there is a match and it is fresh, it will be returned from the cache.
  - If there is no match or a stale match, Next.js will fetch the resource from the remote server and update the cache with the downloaded resource.
- **`no-store`** - Next.js fetches the resource from the remote server on every request without looking in the cache, and it will not update the cache with the downloaded resource.

> **Good to know**:
>
> - If you don't provide a `cache` option, Next.js will default to `force-cache`, unless a [dynamic function](/docs/app/building-your-application/rendering/server-components#server-rendering-strategies#dynamic-functions) such as `cookies()` is used, in which case it will default to `no-store`.
> - The `no-cache` option behaves the same way as `no-store` in Next.js.

### `options.next.revalidate`

```ts
fetch(`https://...`, { next: { revalidate: false | 0 | number } })
```

Set the cache lifetime of a resource (in seconds).

- **`false`** - Cache the resource indefinitely. Semantically equivalent to `revalidate: Infinity`. The HTTP cache may evict older resources over time.
- **`0`** - Prevent the resource from being cached.
- **`number`** - (in seconds) Specify the resource should have a cache lifetime of at most `n` seconds.

> **Good to know**:
>
> - If an individual `fetch()` request sets a `revalidate` number lower than the [default `revalidate`](/docs/app/api-reference/file-conventions/route-segment-config#revalidate) of a route, the whole route revalidation interval will be decreased.
> - If two fetch requests with the same URL in the same route have different `revalidate` values, the lower value will be used.
> - As a convenience, it is not necessary to set the `cache` option if `revalidate` is set to a number since `0` implies `cache: 'no-store'` and a positive value implies `cache: 'force-cache'`.
> - Conflicting options such as `{ revalidate: 0, cache: 'force-cache' }` or `{ revalidate: 10, cache: 'no-store' }` will cause an error.

### `options.next.tags`

```ts
fetch(`https://...`, { next: { tags: ['collection'] } })
```

Set the cache tags of a resource. Data can then be revalidated on-demand using [`revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag). The max length for a custom tag is 256 characters.

## Version History

| Version   | Changes             |
| --------- | ------------------- |
| `v13.0.0` | `fetch` introduced. |
