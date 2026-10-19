// @ts-check

const { setTimeout } = require('timers/promises')

/**
 * A persistent cache handler that simulates a remote cache: its `get` resolves
 * on a macro task (after a delay) rather than in a microtask. Without a
 * built-in in-memory front, a warm read would therefore still be pending at a
 * staged render boundary in dev and be reported as a cold-cache miss. The
 * tiered handler fronts this so warm reads resolve in a microtask instead.
 */

/** @type {Map<string, import('next/dist/server/lib/cache-handlers/types').CacheEntry>} */
const store = new Map()

// Let a route handler purge this backing store out-of-band, so a test can
// verify the tiered front handler stops serving its cached entry afterwards.
/** @type {any} */
const globalScope = globalThis
globalScope.__purgeUseCacheBacking = () => {
  store.clear()
}

/** @type {Map<string, Promise<void>>} */
const pendingSets = new Map()

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey) {
    const pendingPromise = pendingSets.get(cacheKey)
    if (pendingPromise) {
      await pendingPromise
    }

    // Simulate the latency of fetching from a remote cache.
    await setTimeout(200)

    const entry = store.get(cacheKey)
    if (!entry) {
      return undefined
    }

    const [returnStream, savedStream] = entry.value.tee()
    entry.value = savedStream
    return { ...entry, value: returnStream }
  },

  async set(cacheKey, pendingEntry) {
    /** @type {() => void} */
    let resolvePending = () => {}
    const pendingPromise = new Promise((resolve) => {
      resolvePending = /** @type {() => void} */ (resolve)
    })
    pendingSets.set(cacheKey, pendingPromise)

    try {
      const entry = await pendingEntry
      const [value, clonedValue] = entry.value.tee()
      entry.value = value

      // Consume the cloned stream so the entry is fully resolved before
      // storing.
      const reader = clonedValue.getReader()
      while (!(await reader.read()).done) {}

      store.set(cacheKey, entry)
    } finally {
      resolvePending()
      pendingSets.delete(cacheKey)
    }
  },

  async refreshTags() {},

  async getExpiration() {
    return 0
  },

  async updateTags() {},
}

module.exports = cacheHandler
