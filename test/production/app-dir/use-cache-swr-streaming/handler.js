// @ts-check

const { setTimeout } = require('timers/promises')

/** @type {Map<string, import('next/dist/server/lib/cache-handlers/types').CacheEntry>} */
const store = new Map()

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey) {
    const entry = store.get(cacheKey)
    if (!entry) {
      return undefined
    }

    const [returnStream, savedStream] = entry.value.tee()
    entry.value = savedStream

    return { ...entry, value: returnStream }
  },

  async set(cacheKey, pendingEntry) {
    const entry = await pendingEntry
    const [value, clonedValue] = entry.value.tee()
    entry.value = value

    const reader = clonedValue.getReader()
    while (!(await reader.read()).done) {}

    console.log('SlowCacheHandler::set-start', cacheKey)
    await setTimeout(5000)
    store.set(cacheKey, entry)
    console.log('SlowCacheHandler::set-end', cacheKey)
  },

  async refreshTags() {},

  async getExpiration() {
    return Infinity
  },

  async updateTags() {},
}

module.exports = cacheHandler
