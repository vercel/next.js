// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  get: defaultCacheHandler.get.bind(defaultCacheHandler),
  set: defaultCacheHandler.set.bind(defaultCacheHandler),
  refreshTags: defaultCacheHandler.refreshTags.bind(defaultCacheHandler),
  getExpiration: defaultCacheHandler.getExpiration.bind(defaultCacheHandler),
  async updateTags(tags, durations) {
    console.log(
      'StreamedRevalidationCacheHandler::updateTags',
      JSON.stringify(tags)
    )
    return defaultCacheHandler.updateTags(tags, durations)
  },
}

module.exports = cacheHandler
