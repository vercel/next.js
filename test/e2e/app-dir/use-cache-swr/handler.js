// @ts-check

const { setTimeout } = require('timers/promises')

/**
 * A persistent cache handler that does NOT drop entries at revalidate time.
 * This allows the framework's SWR code path to trigger, unlike the default
 * in-memory handler which expires entries at revalidate time.
 */

/** @type {Map<string, import('next/dist/server/lib/cache-handlers/types').CacheEntry>} */
const store = new Map()

/** @type {Map<string, Promise<void>>} */
const pendingSets = new Map()

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey, softTags) {
    const pendingPromise = pendingSets.get(cacheKey)
    if (pendingPromise) {
      console.log('PersistentCacheHandler::get-pending', cacheKey)
      await pendingPromise
    }

    // A slow backend read can return a value captured before revalidation
    // finishes.
    const isSlowRead = cacheKey.includes('"slow-read-')
    const snapshot = isSlowRead ? store.get(cacheKey) : undefined
    await setTimeout(isSlowRead ? 2000 : 200)
    const entry = isSlowRead ? snapshot : store.get(cacheKey)
    if (!entry) {
      console.log('PersistentCacheHandler::get', cacheKey, softTags, '-> miss')
      return undefined
    }

    const [returnStream, savedStream] = entry.value.tee()
    entry.value = savedStream

    console.log(
      'PersistentCacheHandler::get',
      cacheKey,
      softTags,
      '-> hit, revalidate:',
      entry.revalidate
    )

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

      // Consume the cloned stream to ensure the entry is fully resolved.
      const reader = clonedValue.getReader()
      while (!(await reader.read()).done) {}

      if (entry.tags.some((tag) => tag.startsWith('write-completion-'))) {
        console.log('PersistentCacheHandler::set-start', cacheKey)
        // Simulate a slow cache backend after the entry has been collected.
        await setTimeout(2000)
      }

      store.set(cacheKey, entry)
      console.log('PersistentCacheHandler::set', cacheKey)
    } catch (err) {
      console.log('PersistentCacheHandler::set', cacheKey, 'failed', err)
    } finally {
      resolvePending()
      pendingSets.delete(cacheKey)
    }
  },

  async refreshTags() {},

  async getExpiration(_tags) {
    return Infinity
  },

  async updateTags(_tags) {},
}

module.exports = cacheHandler
