// @ts-check

const { requestIdStorage } = require('./als')

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey) {
    return defaultCacheHandler.get(cacheKey)
  },

  async set(cacheKey, pendingEntry) {
    const requestId = requestIdStorage.getStore()
    console.log('set cache', cacheKey, 'requestId:', requestId)
    return defaultCacheHandler.set(cacheKey, pendingEntry)
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
