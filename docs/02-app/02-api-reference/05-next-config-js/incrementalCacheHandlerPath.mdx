---
title: incrementalCacheHandlerPath
description: Configure the Next.js cache used for storing and revalidating data.
---

In Next.js, the [default cache handler](/docs/app/building-your-application/data-fetching/fetching-caching-and-revalidating) uses the filesystem cache. This requires no configuration, however, you can customize the cache handler by using the `incrementalCacheHandlerPath` field in `next.config.js`.

```js filename="next.config.js"
module.exports = {
  experimental: {
    incrementalCacheHandlerPath: require.resolve('./cache-handler.js'),
  },
}
```

Here's an example of a custom cache handler:

```js filename="cache-handler.js"
const cache = new Map()

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options
    this.cache = {}
  }

  async get(key) {
    return cache.get(key)
  }

  async set(key, data) {
    cache.set(key, {
      value: data,
      lastModified: Date.now(),
    })
  }
}
```

## API Reference

The cache handler can implement the following methods: `get`, `set`, and `revalidateTag`.

### `get()`

| Parameter | Type     | Description                  |
| --------- | -------- | ---------------------------- |
| `key`     | `string` | The key to the cached value. |

Returns the cached value or `null` if not found.

### `set()`

| Parameter | Type           | Description                      |
| --------- | -------------- | -------------------------------- |
| `key`     | `string`       | The key to store the data under. |
| `data`    | Data or `null` | The data to be cached.           |

Returns `Promise<void>`.

### `revalidateTag()`

| Parameter | Type     | Description                  |
| --------- | -------- | ---------------------------- |
| `tag`     | `string` | The cache tag to revalidate. |

Returns `Promise<void>`. Learn more about [revalidating data](/docs/app/building-your-application/data-fetching/fetching-caching-and-revalidating) or the [`revalidateTag()`](/docs/app/api-reference/functions/revalidateTag) function.
