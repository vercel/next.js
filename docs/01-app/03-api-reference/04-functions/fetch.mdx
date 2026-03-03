---
title: fetch
description: API reference for the extended fetch function.
---

Next.js extends the [Web `fetch()` API](https://developer.mozilla.org/docs/Web/API/Fetch_API) to allow each request on the server to set its own persistent caching and revalidation semantics.

In the browser, the `cache` option indicates how a fetch request will interact with the _browser's_ HTTP cache. With this extension, `cache` indicates how a _server-side_ fetch request will interact with the framework's persistent cache.

You can call `fetch` with `async` and `await` directly within Server Components.

```tsx filename="app/page.tsx" switcher
export default async function Page() {
  let data = await fetch('https://api.vercel.app/blog')
  let posts = await data.json()
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

```jsx filename="app/page.js" switcher
export default async function Page() {
  let data = await fetch('https://api.vercel.app/blog')
  let posts = await data.json()
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

## `fetch(url, options)`

Since Next.js extends the [Web `fetch()` API](https://developer.mozilla.org/docs/Web/API/Fetch_API), you can use any of the [native options available](https://developer.mozilla.org/docs/Web/API/fetch#parameters).

### `options.cache`

Configure how the request should interact with Next.js [caching](/docs/app/getting-started/caching).

```ts
fetch(`https://...`, { cache: 'force-cache' | 'no-store' })
```

- **`auto no cache`** (default): Next.js fetches the resource from the remote server on every request in development, but will fetch once during `next build` because the route will be statically prerendered. If [Request-time APIs](/docs/app/glossary#request-time-apis) are detected on the route, Next.js will fetch the resource on every request.
- **`no-store`**: Next.js fetches the resource from the remote server on every request, even if Request-time APIs are not detected on the route.
- **`force-cache`**: Next.js looks for a matching request in its server-side cache.
  - If there is a match and it is fresh, it will be returned from the cache.
  - If there is no match or a stale match, Next.js will fetch the resource from the remote server and update the cache with the downloaded resource.

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
> - If an individual `fetch()` request sets a `revalidate` number lower than the [default `revalidate`](/docs/app/guides/caching-without-cache-components#route-segment-config-revalidate) of a route, the whole route revalidation interval will be decreased.
> - If two fetch requests with the same URL in the same route have different `revalidate` values, the lower value will be used.
> - Conflicting options such as `{ revalidate: 3600, cache: 'no-store' }` are not allowed, both will be ignored, and in development mode a warning will be printed to the terminal.

### `options.next.tags`

```ts
fetch(`https://...`, { next: { tags: ['collection'] } })
```

Set the cache tags of a resource. Data can then be revalidated on-demand using [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag). The max length for a custom tag is 256 characters and the max tag items is 128.

## Memoization

`fetch` requests using `GET` with the same URL and options are automatically [memoized](/docs/app/glossary#memoization) during a server render pass. If you call the same `fetch` in multiple Server Components, layouts, pages, `generateStaticParams` and `generateViewport`, Next.js executes it only once and shares the result.

To opt out, pass an [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) signal to `fetch`:

```js
const { signal } = new AbortController()
fetch(url, { signal })
```

> **Good to know**: Memoization does not apply in [Route Handlers](/docs/app/api-reference/file-conventions/route), since they are not part of the React component tree.

## Troubleshooting

### Fetch default `auto no store` and `cache: 'no-store'` not showing fresh data in development

Next.js caches `fetch` responses in Server Components across Hot Module Replacement (HMR) in local development for faster responses and to reduce costs for billed API calls.

By default, the [HMR cache](/docs/app/api-reference/config/next-config-js/serverComponentsHmrCache) applies to all fetch requests, including those with the default `auto no cache` and `cache: 'no-store'` option. This means uncached requests will not show fresh data between HMR refreshes. However, the cache will be cleared on navigation or full-page reloads.

See the [`serverComponentsHmrCache`](/docs/app/api-reference/config/next-config-js/serverComponentsHmrCache) docs for more information.

### Hard refresh and caching in development

In development mode, if the request includes the `cache-control: no-cache` header, `options.cache`, `options.next.revalidate`, and `options.next.tags` are ignored, and the `fetch` request is served from the source.

Browsers typically include `cache-control: no-cache` when the cache is disabled in developer tools or during a hard refresh.

## Version History

| Version   | Changes             |
| --------- | ------------------- |
| `v13.0.0` | `fetch` introduced. |
