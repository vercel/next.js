// @ts-check

const { setTimeout } = require('node:timers/promises')
const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

/**
 * @type {import('next/cache').CacheHandler}
 */
const cacheHandler = {
  ...defaultCacheHandler,
  async get(cacheKey, softTags) {
    // Simulate a network-backed cache.
    await setTimeout(10)
    return defaultCacheHandler.get(cacheKey, softTags)
  },
}

module.exports = cacheHandler
