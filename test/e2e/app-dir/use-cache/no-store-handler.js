// @ts-check

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const noStoreCacheHandler = {
  async get(_cacheKey, _softTags) {
    return undefined
  },

  async set(_cacheKey, _pendingEntry) {},

  async refreshTags() {},

  async getExpiration(_tags) {
    return Infinity
  },

  async updateTags(_tags) {},
}

module.exports = noStoreCacheHandler
