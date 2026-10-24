// @ts-check

const cacheHandler = require('./handler')
const cacheSharingState = require('./cache-sharing-state')
const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

/**
 * This handler checks implicit-tag expiration in `get()`. Its `getExpiration()`
 * returns `Infinity`, so the wrapper does not repeat that check.
 *
 * @type {import('next/cache').CacheHandler}
 */
const routeAwareCacheHandler = {
  ...cacheHandler,

  async get(cacheKey, softTags) {
    const entry = await cacheHandler.get(cacheKey, softTags)
    if (
      cacheKey.includes('observed-miss-') &&
      softTags.some((tag) => tag.includes('/path-revalidation/b'))
    ) {
      // The underlying read has selected its result. A held lookup can
      // therefore return a miss after a concurrent write completes.
      cacheSharingState.routeBLookupKeys.push(cacheKey)
      await cacheSharingState.pendingRouteLookupResult
    }
    if (entry === undefined) {
      return undefined
    }

    if (entry.tags.includes('path-revalidation')) {
      cacheSharingState.softTags.push([...softTags])
      await cacheSharingState.pendingEntryLookup
    }

    const expiration = await cacheHandler.getExpiration(softTags)
    if (entry.timestamp <= expiration) {
      await entry.value.cancel()
      return undefined
    }

    return entry
  },

  async set(cacheKey, pendingEntry) {
    const { tags } = await pendingEntry
    await cacheHandler.set(cacheKey, pendingEntry)
    for (const tag of tags) {
      if (tag.startsWith('observed-fill:')) {
        cacheSharingState.writes.push(tag)
      }
    }
  },

  async getExpiration() {
    // This handler checks implicit tags in get(), so Next.js must use that
    // result for each route.
    return Infinity
  },

  async refreshTags() {
    return defaultCacheHandler.refreshTags()
  },

  async updateTags(tags) {
    return defaultCacheHandler.updateTags(tags)
  },
}

module.exports = routeAwareCacheHandler
