// @ts-check

/**
 * @typedef {import('next/cache').CacheEntry} CacheEntry
 * @typedef {Omit<CacheEntry, 'value'> & { chunks: Uint8Array[] }} StoredEntry
 */

/**
 * @type {Map<string, StoredEntry>}
 */
const entries = new Map()

/**
 * @type {import('next/cache').CacheHandler}
 */
module.exports = {
  async get(cacheKey) {
    const storedEntry = entries.get(cacheKey)
    if (storedEntry === undefined) {
      return undefined
    }

    console.log('RDC handoff handler hit', cacheKey)
    const { chunks, ...metadata } = storedEntry
    return {
      ...metadata,
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
    const { value, ...metadata } = await pendingEntry
    /**
     * @type {Uint8Array[]}
     */
    const chunks = []
    const reader = value.getReader()
    for (let result; !(result = await reader.read()).done; ) {
      chunks.push(result.value)
    }
    entries.set(cacheKey, { ...metadata, chunks })
  },

  async refreshTags() {},
  async getExpiration() {
    return 0
  },
  async updateTags() {},
}
