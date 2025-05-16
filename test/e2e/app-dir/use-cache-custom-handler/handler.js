// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default').default

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandlerV2}
 */
const cacheHandler = {
  async get(cacheKey, softTags) {
    console.log('ModernCustomCacheHandler::get', cacheKey, softTags)
    return defaultCacheHandler.get(cacheKey, softTags)
  },

  async set(cacheKey, pendingEntry) {
    console.log('ModernCustomCacheHandler::set', cacheKey)
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
