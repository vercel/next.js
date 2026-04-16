// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
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

  async getExpiration(tags) {
    console.log('ModernCustomCacheHandler::getExpiration', JSON.stringify(tags))
    // Expecting soft tags in `get` to be used by the cache handler for checking
    // the expiration of a cache entry, instead of letting Next.js handle it.
    return Infinity
  },

  async updateTags(tags) {
    console.log('ModernCustomCacheHandler::updateTags', JSON.stringify(tags))
    return defaultCacheHandler.updateTags(tags)
  },
}

module.exports = cacheHandler
