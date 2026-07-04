// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default
const { AsyncLocalStorage } = require('node:async_hooks')
const snapshot = AsyncLocalStorage.snapshot()

/**
 * A wrapper around the default cache handler that logs the cache life
 * metadata of stored entries. Backing stores commonly serialize entries as
 * JSON, so the metadata must consist of finite numbers.
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey, softTags) {
    return defaultCacheHandler.get(cacheKey, softTags)
  },

  async set(cacheKey, pendingEntry) {
    pendingEntry.then(({ revalidate, expire, stale, tags }) => {
      snapshot(() => {
        console.log(
          `LoggingCacheHandler::set-resolved-entry revalidate: ${revalidate}, expire: ${expire}, stale: ${stale}, tags: ${tags}`
        )
      })
    })

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
