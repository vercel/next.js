/**
 * Simple LRU cache handler with max entries eviction policy.
 * When the cache exceeds maxEntries, the least recently used entries are evicted.
 */

const MAX_IMAGE_ENTRIES = parseInt(
  process.env.MAX_IMAGE_CACHE_ENTRIES || '2',
  10
)

class LRUCache {
  constructor(maxEntries) {
    this.maxEntries = maxEntries
    this.cache = new Map()
  }

  get(key) {
    if (!this.cache.has(key)) {
      return undefined
    }
    // Move to end (most recently used)
    const value = this.cache.get(key)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key, value) {
    // If key exists, delete it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value
      console.log('cache-handler evicting', oldestKey)
      this.cache.delete(oldestKey)
    }
    this.cache.set(key, value)
  }

  has(key) {
    return this.cache.has(key)
  }

  get size() {
    return this.cache.size
  }

  keys() {
    return Array.from(this.cache.keys())
  }
}

// Separate caches for different kinds
const imageCache = new LRUCache(MAX_IMAGE_ENTRIES)
const pageCache = new LRUCache(100) // Higher limit for pages

class CacheHandler {
  constructor(options) {
    this.options = options
    console.log('initialized custom cache-handler')
    console.log('max image cache entries:', MAX_IMAGE_ENTRIES)
  }

  async get(key, ctx) {
    const kind = ctx?.kind
    console.log('cache-handler get', key, 'kind:', kind)

    const cache = kind === 'IMAGE' ? imageCache : pageCache
    const entry = cache.get(key)

    if (entry) {
      console.log('cache-handler hit', key)
      return entry
    }
    console.log('cache-handler miss', key)
    return null
  }

  async set(key, data, ctx) {
    const kind = data?.kind
    console.log('cache-handler set', key, 'kind:', kind)

    const cache = kind === 'IMAGE' ? imageCache : pageCache
    cache.set(key, {
      value: data,
      lastModified: Date.now(),
    })

    if (kind === 'IMAGE') {
      console.log('cache-handler image cache size:', imageCache.size)
      console.log(
        'cache-handler image cache keys:',
        imageCache.keys().join(', ')
      )
    }
  }

  async revalidateTag(tags) {
    console.log('cache-handler revalidateTag', tags)
  }
}

module.exports = CacheHandler
