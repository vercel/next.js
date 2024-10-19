/*
  This is the default "use cache" handler it defaults
  to an in memory store
*/
import { LRUCache } from '../lru-cache'
import type { CacheEntry, CacheHandler } from './types'
import { isTagStale, tagsManifest } from '../incremental-cache/tags-manifest'

type DefaultCacheEntry = CacheEntry & {
  // For the default cache we store errored cache
  // entries and allow them to be used up to 3 times
  // after that we want to dispose it and try for fresh

  // If an entry is errored we return no entry
  // three times so that we retry hitting origin (MISS)
  // and then if it still fails to set after the third we
  // return the errored content and use expiration of
  // Math.min(30, entry.expiration)
  isErrored?: boolean
  errorRetryCount?: number

  // compute size on set since we need to read size
  // of the ReadableStream for LRU evicting
  size?: number
}

// LRU cache default to max 50 MB but in future track
const memoryCache = new LRUCache<DefaultCacheEntry>(50_000_000)
const pendingSets = new Map<string, Promise<void>>()

export const DefaultCacheHandler: CacheHandler = {
  async get(cacheKey, softTags) {
    await pendingSets.get(cacheKey)

    if (isTagStale(softTags)) {
      return
    }
    const entry = memoryCache.get(cacheKey)

    if (!entry) {
      return
    }
    if (
      performance.timeOrigin + performance.now() >
      entry.timestamp + entry.revalidate * 1000
    ) {
      // In memory caches should expire after revalidate time because it is unlikely that
      // a new entry will be able to be used before it is dropped from the cache.
      return
    }

    if (isTagStale(entry.tags || [])) {
      return
    }
    const [returnStream, newSaved] = entry.value.tee()
    entry.value = newSaved

    return {
      ...entry,
      value: returnStream,
    }
  },

  async set(cacheKey, entry) {
    let resolvePending: () => void = () => {}
    const pendingPromise = new Promise<void>((resolve) => {
      resolvePending = resolve
    })
    pendingSets.set(cacheKey, pendingPromise)

    const timestamp = performance.timeOrigin + performance.now()
    const {
      value: originalValue,
      revalidate,
      tags,
      expire,
      stale,
    } = await entry

    let size = 0
    let buffer = []

    try {
      const [value, clonedValue] = originalValue.tee()
      const reader = clonedValue.getReader()

      for (let chunk; !(chunk = await reader.read()).done; ) {
        size += Buffer.from(chunk.value).byteLength
        buffer.push(chunk.value)
      }

      memoryCache.set(cacheKey, {
        value,
        revalidate,
        tags,
        expire,
        stale,
        timestamp,
        size,
      })
    } catch (err) {
      console.error(`Error while saving cache key: ${cacheKey}`, err)
      // TODO: store partial buffer with error after we retry 3 times
    } finally {
      resolvePending()
      pendingSets.delete(cacheKey)
    }
  },

  async expireTags(tags) {
    for (const tag of tags) {
      if (!tagsManifest.items[tag]) {
        tagsManifest.items[tag] = {}
      }
      // TODO: use performance.now and update file-system-cache?
      tagsManifest.items[tag].revalidatedAt = Date.now()
    }
  },

  async receiveExpiredTags(tags): Promise<void> {
    return this.expireTags(...tags)
  },
}
