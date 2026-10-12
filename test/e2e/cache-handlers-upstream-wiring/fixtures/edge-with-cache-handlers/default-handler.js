// @ts-check

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler & { wiringMarker: string }}
 */
const cacheHandler = {
  wiringMarker: 'edge-default-handler',
  async get() {
    return undefined
  },
  async set(_cacheKey, pendingEntry) {
    await pendingEntry
  },
  async refreshTags() {},
  async getExpiration() {
    return 0
  },
  async updateTags() {},
}

module.exports = cacheHandler
