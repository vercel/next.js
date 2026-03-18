/**
 * This is the default "use cache" handler it defaults to an in-memory store.
 * In-memory caches are fragile and should not use stale-while-revalidate
 * semantics on the caches because it's not worth warming up an entry that's
 * likely going to get evicted before we get to use it anyway. However, we also
 * don't want to reuse a stale entry for too long so stale entries should be
 * considered expired/missing in such cache handlers.
 */

import { LRUCache } from '../lru-cache'
import type { CacheEntry, CacheHandler } from './types'
import {
  areTagsExpired,
  areTagsStale,
  tagsManifest,
  type TagManifestEntry,
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

export function createDefaultCacheHandler(maxSize: number): CacheHandler {
  // If the max size is 0, return a cache handler that doesn't cache anything,
  // this avoids an unnecessary LRUCache instance and potential memory
  // allocation.
  if (maxSize === 0) {
    return {
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
      refreshTags: () => Promise.resolve(),
      getExpiration: () => Promise.resolve(0),
      updateTags: () => Promise.resolve(),
    }
  }

  const memoryCache = new LRUCache<PrivateCacheEntry>(
    maxSize,
    (entry) => entry.size
  )
  const pendingSets = new Map<string, Promise<void>>()

  const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
    ? console.debug.bind(console, 'DefaultCacheHandler:')
    : undefined

  return {
    async get(cacheKey) {
      const pendingPromise = pendingSets.get(cacheKey)

      if (pendingPromise) {
        debug?.('get', cacheKey, 'pending')
        await pendingPromise
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

      let revalidate = entry.revalidate

      if (areTagsExpired(entry.tags, entry.timestamp)) {
        debug?.('get', cacheKey, 'had expired tag')
        return undefined
      }

      if (areTagsStale(entry.tags, entry.timestamp)) {
        debug?.('get', cacheKey, 'had stale tag')
        revalidate = -1
      }

      const [returnStream, newSaved] = entry.value.tee()
      entry.value = newSaved

      debug?.('get', cacheKey, 'found', {
        tags: entry.tags,
        timestamp: entry.timestamp,
        expire: entry.expire,
        revalidate,
      })

      return {
        ...entry,
        revalidate,
        value: returnStream,
      }
    },

    async set(cacheKey, pendingEntry) {
      debug?.('set', cacheKey, 'start')

      let resolvePending: () => void = () => {}
      const pendingPromise = new Promise<void>((resolve) => {
        resolvePending = resolve
      })
      pendingSets.set(cacheKey, pendingPromise)

      const entry = await pendingEntry

      let size = 0

      try {
        const [value, clonedValue] = entry.value.tee()
        entry.value = value
        const reader = clonedValue.getReader()

        for (let chunk; !(chunk = await reader.read()).done; ) {
          size += Buffer.from(chunk.value).byteLength
        }

        memoryCache.set(cacheKey, {
          entry,
          isErrored: false,
          errorRetryCount: 0,
          size,
        })

        debug?.('set', cacheKey, 'done')
      } catch (err) {
        // TODO: store partial buffer with error after we retry 3 times
        debug?.('set', cacheKey, 'failed', err)
      } finally {
        resolvePending()
        pendingSets.delete(cacheKey)
      }
    },

    async refreshTags() {
      // Nothing to do for an in-memory cache handler.
    },

    async getExpiration(tags) {
      const expirations = tags.map((tag) => {
        const entry = tagsManifest.get(tag)
        if (!entry) return 0
        // Return the most recent timestamp (either expired or stale)
        return entry.expired || 0
      })

      const expiration = Math.max(...expirations, 0)

      debug?.('getExpiration', { tags, expiration })

      return expiration
    },

    async updateTags(tags, durations) {
      const now = Math.round(performance.timeOrigin + performance.now())
      debug?.('updateTags', { tags, timestamp: now })

      for (const tag of tags) {
        // TODO: update file-system-cache?
        const existingEntry = tagsManifest.get(tag) || {}

        if (durations) {
          // Use provided durations directly
          const updates: TagManifestEntry = { ...existingEntry }

          // mark as stale immediately
          updates.stale = now

          if (durations.expire !== undefined) {
            updates.expired = now + durations.expire * 1000 // Convert seconds to ms
          }

          tagsManifest.set(tag, updates)
        } else {
          // Update expired field for immediate expiration (default behavior when no durations provided)
          tagsManifest.set(tag, { ...existingEntry, expired: now })
        }
      }
    },
  }
}
