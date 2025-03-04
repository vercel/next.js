const cacheHandler =
  require('next/dist/server/lib/cache-handlers/default').default

module.exports = {
  name: 'custom-cache-handler',
  async get(cacheKey, softTags) {
    console.log('CustomCacheHandler::Get', cacheKey, softTags)
    return cacheHandler.get(cacheKey, softTags)
  },

  async set(cacheKey, pendingEntry) {
    console.log('CustomCacheHandler::Set', cacheKey)
    return cacheHandler.set(cacheKey, pendingEntry)
  },

  async expireTags(...tags) {
    console.log('CustomCacheHandler::ExpireTags', tags)
    return cacheHandler.expireTags(...tags)
  },
  async receiveExpiredTags(...tags) {
    console.log('CustomCacheHandler::ReceiveExpiredTags', tags)
    return cacheHandler.receiveExpiredTags(...tags)
  },
}
