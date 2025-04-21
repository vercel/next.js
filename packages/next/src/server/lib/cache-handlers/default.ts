/**
 * This is the default "use cache" handler it defaults to an in-memory store.
 * In-memory caches are fragile and should not use stale-while-revalidate
 * semantics on the caches because it's not worth warming up an entry that's
 * likely going to get evicted before we get to use it anyway. However, we also
 * don't want to reuse a stale entry for too long so stale entries should be
 * considered expired/missing in such cache handlers.
 */

import { LRUCache } from '../lru-cache'
import type { CacheEntry, CacheHandlerV2 } from './types'
import {
  isStale,
  tagsManifest,
} from '../incremental-cache/tags-manifest.external'

type PrivateCacheEntry = {
  entry: CacheEntry

  // For the default cache we store errored cache
  // entries and allow them to be used up to 3 times
  // after that we want to dispose it and try for fresh

  // If an entry is errored we return no entry
  // three times so that we retry hitting origin (MISS)
  // and then if it still fails to set after the third we
  // return the errored content and use expiration of
  // Math.min(30, entry.expiration)
  isErrored: boolean
  errorRetryCount: number

  // compute size on set since we need to read size
  // of the ReadableStream for LRU evicting
  size: number
}

// LRU cache default to max 50 MB but in future track
const memoryCache = new LRUCache<PrivateCacheEntry>(
  50 * 1024 * 1024,
  (entry) => entry.size
)

/**
 * Maps an original cache key to the final cache key after a set operation has
 * resolved.
 */
const pendingSets = new Map<string, Promise<string>>()

const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
  ? console.debug.bind(console, 'DefaultCacheHandler:')
  : undefined

const DefaultCacheHandler: CacheHandlerV2 = {
  async get(cacheKey) {
    const pendingPromise = pendingSets.get(cacheKey)

    if (pendingPromise) {
      debug?.('get', cacheKey, 'pending')
      const finalCacheKey = await pendingPromise
      debug?.('get', cacheKey, 'resolved to', finalCacheKey)
      cacheKey = finalCacheKey
    }

    const privateEntry = memoryCache.get(cacheKey)

    if (!privateEntry) {
      debug?.('get', cacheKey, 'not found')
      return undefined
    }

    const entry = privateEntry.entry
    if (
      performance.timeOrigin + performance.now() >
      entry.timestamp + entry.revalidate * 1000
    ) {
      // In-memory caches should expire after revalidate time because it is
      // unlikely that a new entry will be able to be used before it is dropped
      // from the cache.
      debug?.('get', cacheKey, 'expired')

      return undefined
    }

    if (isStale(entry.tags, entry.timestamp)) {
      debug?.('get', cacheKey, 'had stale tag')

      return undefined
    }
    const [returnStream, newSaved] = entry.value.tee()
    entry.value = newSaved

    debug?.('get', cacheKey, 'found', {
      tags: entry.tags,
      timestamp: entry.timestamp,
      revalidate: entry.revalidate,
      expire: entry.expire,
    })

    return {
      ...entry,
      value: returnStream,
    }
  },

  async set(cacheKey, pendingEntry) {
    debug?.('set', cacheKey, 'start')

    let resolvePending: (finalCacheKey: string) => void = () => {}
    const pendingPromise = new Promise<string>((resolve) => {
      resolvePending = resolve
    })
    pendingSets.set(cacheKey, pendingPromise)

    const entry = await pendingEntry
    const finalCacheKey = entry.key

    let size = 0

    try {
      const [value, clonedValue] = entry.value.tee()
      entry.value = value
      const reader = clonedValue.getReader()

      for (let chunk; !(chunk = await reader.read()).done; ) {
        size += Buffer.from(chunk.value).byteLength
      }

      memoryCache.set(finalCacheKey, {
        entry,
        isErrored: false,
        errorRetryCount: 0,
        size,
      })

      debug?.('set', finalCacheKey, 'done')
    } catch (err) {
      // TODO: store partial buffer with error after we retry 3 times
      debug?.('set', cacheKey, 'failed', err)
    } finally {
      resolvePending(finalCacheKey)
      pendingSets.delete(cacheKey)
    }
  },

  async refreshTags() {
    // Nothing to do for an in-memory cache handler.
  },

  async getExpiration(...tags) {
    const expiration = Math.max(
      ...tags.map((tag) => tagsManifest.get(tag) ?? 0)
    )

    debug?.('getExpiration', { tags, expiration })

    return expiration
  },

  async expireTags(...tags) {
    const timestamp = Math.round(performance.timeOrigin + performance.now())
    debug?.('expireTags', { tags, timestamp })

    for (const tag of tags) {
      // TODO: update file-system-cache?
      tagsManifest.set(tag, timestamp)
    }
  },
}

export default DefaultCacheHandler
