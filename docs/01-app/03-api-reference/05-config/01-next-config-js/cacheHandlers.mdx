---
title: cacheHandlers
description: Configure custom cache handlers for use cache directives in Next.js.
related:
  title: Related
  description: View related API references.
  links:
    - app/api-reference/directives/use-cache
    - app/api-reference/directives/use-cache-remote
    - app/api-reference/directives/use-cache-private
    - app/api-reference/config/next-config-js/cacheLife
---

The `cacheHandlers` configuration allows you to define custom cache storage implementations for [`'use cache'`](/docs/app/api-reference/directives/use-cache) and [`'use cache: remote'`](/docs/app/api-reference/directives/use-cache-remote). This enables you to store cached components and functions in external services or customize the caching behavior. [`'use cache: private'`](/docs/app/api-reference/directives/use-cache-private) is not configurable.

## When to use custom cache handlers

**Most applications don't need custom cache handlers.** The default in-memory cache works well in the typical use case.

Custom cache handlers are for advanced scenarios where you need to either share cache across multiple instances or change where the cache is stored. For example, you can configure a custom `remote` handler for external storage (like a key-value store), then use `'use cache'` in your code for in-memory caching and `'use cache: remote'` for the external storage, allowing different caching strategies within the same application.

**Sharing cache across instances**

The default in-memory cache is isolated to each Next.js process. If you're running multiple servers or containers, each instance will have its own cache that isn't shared with others and is lost on restart.

Custom handlers let you integrate with shared storage systems (like Redis, Memcached, or DynamoDB) that all your Next.js instances can access.

**Changing storage type**

You might want to store cache differently than the default in-memory approach. You can implement a custom handler to store cache on disk, in a database, or in an external caching service. Reasons include: persistence across restarts, reducing memory usage, or integrating with existing infrastructure.

## Usage

To configure custom cache handlers:

1. Define your cache handler in a separate file, see [examples](#examples) for implementation details.
2. Reference the file path in your Next config file

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheHandlers: {
    default: require.resolve('./cache-handlers/default-handler.js'),
    remote: require.resolve('./cache-handlers/remote-handler.js'),
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
module.exports = {
  cacheHandlers: {
    default: require.resolve('./cache-handlers/default-handler.js'),
    remote: require.resolve('./cache-handlers/remote-handler.js'),
  },
}
```

### Handler types

- **`default`**: Used by the `'use cache'` directive
- **`remote`**: Used by the `'use cache: remote'` directive

If you don't configure `cacheHandlers`, Next.js uses an in-memory LRU (Least Recently Used) cache for both `default` and `remote`. You can view the [default implementation](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/cache-handlers/default.ts) as a reference.

You can also define additional named handlers (e.g., `sessions`, `analytics`) and reference them with `'use cache: <name>'`.

Note that `'use cache: private'` does not use cache handlers and cannot be customized.

## API Reference

A cache handler must implement the [`CacheHandler`](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/cache-handlers/types.ts) interface with the following methods:

### `get()`

Retrieve a cache entry for the given cache key.

```ts
get(cacheKey: string, softTags: string[]): Promise<CacheEntry | undefined>
```

| Parameter  | Type       | Description                                                  |
| ---------- | ---------- | ------------------------------------------------------------ |
| `cacheKey` | `string`   | The unique key for the cache entry.                          |
| `softTags` | `string[]` | Tags to check for staleness (used in some cache strategies). |

Returns a `CacheEntry` object if found, or `undefined` if not found or expired.

Your `get` method should retrieve the cache entry from storage, check if it has expired based on the `revalidate` time, and return `undefined` for missing or expired entries.

```js
const cacheHandler = {
  async get(cacheKey, softTags) {
    const entry = cache.get(cacheKey)
    if (!entry) return undefined

    // Check if expired
    const now = Date.now()
    if (now > entry.timestamp + entry.revalidate * 1000) {
      return undefined
    }

    return entry
  },
}
```

### `set()`

Store a cache entry for the given cache key.

```ts
set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void>
```

| Parameter      | Type                  | Description                                 |
| -------------- | --------------------- | ------------------------------------------- |
| `cacheKey`     | `string`              | The unique key to store the entry under.    |
| `pendingEntry` | `Promise<CacheEntry>` | A promise that resolves to the cache entry. |

The entry may still be pending when this is called (i.e., its value stream may still be written to). Your handler should await the promise before processing the entry.

Returns `Promise<void>`.

Your `set` method must await the `pendingEntry` promise before storing it, since the cache entry may still be generating when this method is called. Once resolved, store the entry in your cache system.

```js
const cacheHandler = {
  async set(cacheKey, pendingEntry) {
    // Wait for the entry to be ready
    const entry = await pendingEntry

    // Store in your cache system
    cache.set(cacheKey, entry)
  },
}
```

### `refreshTags()`

Called periodically before starting a new request to sync with external tag services.

```ts
refreshTags(): Promise<void>
```

This is useful if you're coordinating cache invalidation across multiple instances or services. For in-memory caches, this can be a no-op.

Returns `Promise<void>`.

For in-memory caches, this can be a no-op. For distributed caches, use this to sync tag state from an external service or database before processing requests.

```js
const cacheHandler = {
  async refreshTags() {
    // For in-memory cache, no action needed
    // For distributed cache, sync tag state from external service
  },
}
```

### `getExpiration()`

Get the maximum revalidation timestamp for a set of tags.

```ts
getExpiration(tags: string[]): Promise<number>
```

| Parameter | Type       | Description                            |
| --------- | ---------- | -------------------------------------- |
| `tags`    | `string[]` | Array of tags to check expiration for. |

Returns:

- `0` if none of the tags were ever revalidated
- A timestamp (in milliseconds) representing the most recent revalidation
- `Infinity` to indicate soft tags should be checked in the `get` method instead

If you're not tracking tag revalidation timestamps, return `0`. Otherwise, find the most recent revalidation timestamp across all the provided tags. Return `Infinity` if you prefer to handle soft tag checking in the `get` method.

```js
const cacheHandler = {
  async getExpiration(tags) {
    // Return 0 if not tracking tag revalidation
    return 0

    // Or return the most recent revalidation timestamp
    // return Math.max(...tags.map(tag => tagTimestamps.get(tag) || 0));
  },
}
```

### `updateTags()`

Called when tags are revalidated or expired.

```ts
updateTags(tags: string[], durations?: { expire?: number }): Promise<void>
```

| Parameter   | Type                  | Description                              |
| ----------- | --------------------- | ---------------------------------------- |
| `tags`      | `string[]`            | Array of tags to update.                 |
| `durations` | `{ expire?: number }` | Optional expiration duration in seconds. |

Your handler should update its internal state to mark these tags as invalidated.

Returns `Promise<void>`.

When tags are revalidated, your handler should invalidate all cache entries that have any of those tags. Iterate through your cache and remove entries whose tags match the provided list.

```js
const cacheHandler = {
  async updateTags(tags, durations) {
    // Invalidate all cache entries with matching tags
    for (const [key, entry] of cache.entries()) {
      if (entry.tags.some((tag) => tags.includes(tag))) {
        cache.delete(key)
      }
    }
  },
}
```

## CacheEntry Type

The [`CacheEntry`](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/cache-handlers/types.ts) object has the following structure:

```ts
interface CacheEntry {
  value: ReadableStream<Uint8Array>
  tags: string[]
  stale: number
  timestamp: number
  expire: number
  revalidate: number
}
```

| Property     | Type                         | Description                                                  |
| ------------ | ---------------------------- | ------------------------------------------------------------ |
| `value`      | `ReadableStream<Uint8Array>` | The cached data as a stream.                                 |
| `tags`       | `string[]`                   | Cache tags (excluding soft tags).                            |
| `stale`      | `number`                     | Duration in seconds for client-side staleness.               |
| `timestamp`  | `number`                     | When the entry was created (timestamp in milliseconds).      |
| `expire`     | `number`                     | How long the entry is allowed to be used (in seconds).       |
| `revalidate` | `number`                     | How long until the entry should be revalidated (in seconds). |

> **Good to know**:
>
> - The `value` is a [`ReadableStream`](https://developer.mozilla.org/docs/Web/API/ReadableStream). Use [`.tee()`](https://developer.mozilla.org/docs/Web/API/ReadableStream/tee) if you need to read and store the stream data.
> - If the stream errors with partial data, your handler must decide whether to keep the partial cache or discard it.

## Examples

### Basic in-memory cache handler

Here's a minimal implementation using a `Map` for storage. This example demonstrates the core concepts, but for a production-ready implementation with LRU eviction, error handling, and tag management, see the [default cache handler](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/cache-handlers/default.ts).

```js filename="cache-handlers/memory-handler.js"
const cache = new Map()
const pendingSets = new Map()

module.exports = {
  async get(cacheKey, softTags) {
    // Wait for any pending set operation to complete
    const pendingPromise = pendingSets.get(cacheKey)
    if (pendingPromise) {
      await pendingPromise
    }

    const entry = cache.get(cacheKey)
    if (!entry) {
      return undefined
    }

    // Check if entry has expired
    const now = Date.now()
    if (now > entry.timestamp + entry.revalidate * 1000) {
      return undefined
    }

    return entry
  },

  async set(cacheKey, pendingEntry) {
    // Create a promise to track this set operation
    let resolvePending
    const pendingPromise = new Promise((resolve) => {
      resolvePending = resolve
    })
    pendingSets.set(cacheKey, pendingPromise)

    try {
      // Wait for the entry to be ready
      const entry = await pendingEntry

      // Store the entry in the cache
      cache.set(cacheKey, entry)
    } finally {
      resolvePending()
      pendingSets.delete(cacheKey)
    }
  },

  async refreshTags() {
    // No-op for in-memory cache
  },

  async getExpiration(tags) {
    // Return 0 to indicate no tags have been revalidated
    return 0
  },

  async updateTags(tags, durations) {
    // Implement tag-based invalidation
    for (const [key, entry] of cache.entries()) {
      if (entry.tags.some((tag) => tags.includes(tag))) {
        cache.delete(key)
      }
    }
  },
}
```

### External storage pattern

For durable storage like Redis or a database, you'll need to serialize the cache entries. Here's a simple Redis example:

```js filename="cache-handlers/redis-handler.js"
const { createClient } = require('redis')

const client = createClient({ url: process.env.REDIS_URL })
client.connect()

module.exports = {
  async get(cacheKey, softTags) {
    // Retrieve from Redis
    const stored = await client.get(cacheKey)
    if (!stored) return undefined

    // Deserialize the entry
    const data = JSON.parse(stored)

    // Reconstruct the ReadableStream from stored data
    return {
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(data.value, 'base64'))
          controller.close()
        },
      }),
      tags: data.tags,
      stale: data.stale,
      timestamp: data.timestamp,
      expire: data.expire,
      revalidate: data.revalidate,
    }
  },

  async set(cacheKey, pendingEntry) {
    const entry = await pendingEntry

    // Read the stream to get the data
    const reader = entry.value.getReader()
    const chunks = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }

    // Combine chunks and serialize for Redis storage
    const data = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))

    await client.set(
      cacheKey,
      JSON.stringify({
        value: data.toString('base64'),
        tags: entry.tags,
        stale: entry.stale,
        timestamp: entry.timestamp,
        expire: entry.expire,
        revalidate: entry.revalidate,
      }),
      { EX: entry.expire } // Use Redis TTL for automatic expiration
    )
  },

  async refreshTags() {
    // No-op for basic Redis implementation
    // Could sync with external tag service if needed
  },

  async getExpiration(tags) {
    // Return 0 to indicate no tags have been revalidated
    // Could query Redis for tag expiration timestamps if tracking them
    return 0
  },

  async updateTags(tags, durations) {
    // Implement tag-based invalidation if needed
    // Could iterate over keys with matching tags and delete them
  },
}
```

## Platform Support

| Deployment Option                                                   | Supported         |
| ------------------------------------------------------------------- | ----------------- |
| [Node.js server](/docs/app/getting-started/deploying#nodejs-server) | Yes               |
| [Docker container](/docs/app/getting-started/deploying#docker)      | Yes               |
| [Static export](/docs/app/getting-started/deploying#static-export)  | No                |
| [Adapters](/docs/app/getting-started/deploying#adapters)            | Platform-specific |

## Version History

| Version   | Changes                     |
| --------- | --------------------------- |
| `v16.0.0` | `cacheHandlers` introduced. |
