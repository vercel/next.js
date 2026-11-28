// @ts-check

/**
 * @typedef {import('next/dist/server/lib/cache-handlers/types').CacheEntry} CacheEntry
 */

/**
 * @type {Map<string, CacheEntry>}
 */
const entries = new Map()

module.exports = {
  /**
   * @param {string} cacheKey
   */
  get(cacheKey) {
    const entry = entries.get(cacheKey)
    if (entry === undefined) {
      return undefined
    }
    const [value, retained] = entry.value.tee()
    entry.value = retained
    return { ...entry, value }
  },
  /**
   * @param {string} cacheKey
   * @param {Promise<CacheEntry>} pendingEntry
   */
  async set(cacheKey, pendingEntry) {
    const entry = await pendingEntry
    const [value, consumed] = entry.value.tee()
    const reader = consumed.getReader()
    while (!(await reader.read()).done) {}
    entries.set(cacheKey, { ...entry, value })
  },
}
