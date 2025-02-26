const cacheHandler =
  require('next/dist/server/lib/cache-handlers/default').default

module.exports = {
  async get(cacheKey, softTags) {
    console.log('CustomCacheHandler::Get', cacheKey, softTags)
    return cacheHandler.get(cacheKey, softTags)
  },

  async set(cacheKey, pendingEntry) {
    console.log('CustomCacheHandler::Set', cacheKey)
    return cacheHandler.set(cacheKey, pendingEntry)
  },

  async expireTags(...tags) {},
  async receiveExpiredTags(...tags) {},
}
