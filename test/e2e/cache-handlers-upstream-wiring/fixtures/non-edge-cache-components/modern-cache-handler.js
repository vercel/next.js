// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey, softTags) {
    console.log('WiringModernCacheHandler::get', cacheKey, softTags)
    return defaultCacheHandler.get(cacheKey, softTags)
  },

  async set(cacheKey, pendingEntry) {
    console.log('WiringModernCacheHandler::set', cacheKey)
    return defaultCacheHandler.set(cacheKey, pendingEntry)
  },

  async refreshTags() {
    console.log('WiringModernCacheHandler::refreshTags')
    return defaultCacheHandler.refreshTags()
  },

  async getExpiration(tags) {
    console.log('WiringModernCacheHandler::getExpiration', JSON.stringify(tags))
    return Infinity
  },

  async updateTags(tags) {
    console.log('WiringModernCacheHandler::updateTags', JSON.stringify(tags))
    return defaultCacheHandler.updateTags(tags)
  },
}

module.exports = cacheHandler
