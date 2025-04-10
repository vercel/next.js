// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default').default

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandlerV2}
 */
const cacheHandler = {
  async get(cacheKey, metaData) {
    console.log('ModernCustomCacheHandler::get', metaData.displayName, cacheKey)
    return defaultCacheHandler.get(cacheKey)
  },

  async set(cacheKey, pendingEntry, metaData) {
    console.log('ModernCustomCacheHandler::set', metaData.displayName, cacheKey)
    return defaultCacheHandler.set(cacheKey, pendingEntry)
  },

  async refreshTags() {
    console.log('ModernCustomCacheHandler::refreshTags')
    return defaultCacheHandler.refreshTags()
  },

  async getExpiration(...tags) {
    console.log('ModernCustomCacheHandler::getExpiration', JSON.stringify(tags))
    return defaultCacheHandler.getExpiration(...tags)
  },

  async expireTags(...tags) {
    console.log('ModernCustomCacheHandler::expireTags', JSON.stringify(tags))
    return defaultCacheHandler.expireTags(...tags)
  },
}

module.exports = cacheHandler
