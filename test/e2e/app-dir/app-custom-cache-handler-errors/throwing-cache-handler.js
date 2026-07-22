// @ts-check

/**
 * A self-contained "use cache" cache handler that throws from the method
 * specified via the `CACHE_HANDLER_THROW_ON` env var ('get' or 'set'). The
 * other methods behave like a normal in-memory cache so that the throwing
 * method is actually reached.
 */

/**
 * @typedef {import('next/dist/server/lib/cache-handlers/types').CacheEntry} CacheEntry
 * @typedef {Omit<CacheEntry, 'value'> & { chunks: Uint8Array[] }} StoredEntry
 */

/** @type {Map<string, StoredEntry>} */
const cache = new Map()

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey) {
    if (process.env.CACHE_HANDLER_THROW_ON === 'get') {
      throw new Error('CustomCacheHandler.get failed')
    }

    const storedEntry = cache.get(cacheKey)

    if (storedEntry === undefined) {
      return undefined
    }

    const { chunks, ...entry } = storedEntry

    return {
      ...entry,
      value: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk)
          }
          controller.close()
        },
      }),
    }
  },

  async set(cacheKey, pendingEntry) {
    if (process.env.CACHE_HANDLER_THROW_ON === 'set') {
      throw new Error('CustomCacheHandler.set failed')
    }

    const { value, ...entry } = await pendingEntry

    /** @type {Uint8Array[]} */
    const chunks = []
    const reader = value.getReader()

    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) {
        break
      }
      chunks.push(chunk)
    }

    cache.set(cacheKey, { ...entry, chunks })
  },

  async refreshTags() {},

  async getExpiration() {
    return Infinity
  },

  async updateTags() {},
}

module.exports = cacheHandler
