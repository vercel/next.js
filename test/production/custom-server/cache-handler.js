// @ts-check

const { requestIdStorage } = require('./als')

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default').default

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandlerV2}
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

  async getExpiration(...tags) {
    return defaultCacheHandler.getExpiration(...tags)
  },

  async expireTags(...tags) {
    return defaultCacheHandler.expireTags(...tags)
  },
}

module.exports = cacheHandler
