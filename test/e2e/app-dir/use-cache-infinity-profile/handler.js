// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

/**
 * A cache handler whose backing store serializes entries as JSON, like a
 * remote store would.
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey, softTags) {
    return defaultCacheHandler.get(cacheKey, softTags)
  },

  async set(cacheKey, pendingEntry) {
    return defaultCacheHandler.set(
      cacheKey,
      pendingEntry.then(({ value, ...metadata }) => ({
        ...JSON.parse(JSON.stringify(metadata)),
        value,
      }))
    )
  },

  async refreshTags() {
    return defaultCacheHandler.refreshTags()
  },

  async getExpiration(tags) {
    return defaultCacheHandler.getExpiration(tags)
  },

  async updateTags(tags) {
    return defaultCacheHandler.updateTags(tags)
  },
}

module.exports = cacheHandler
