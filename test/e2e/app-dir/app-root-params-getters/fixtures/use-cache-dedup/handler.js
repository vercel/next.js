// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default
const { EventEmitter, once } = require('node:events')
const outerWrites = new EventEmitter()
const pendingOuterWrites = once(outerWrites, 'complete')
const observedOuters = new Set()

// Delay the English inner write until both outer entries reach `set()`. The
// nested route calls `outerOne()` and then `outerTwo()`, which share `inner()`.
// The wrapper must propagate the inner language dependency before it computes
// the cache key for `outerTwo()`. Otherwise, a later French request can reuse
// the English outer entry.

/**
 * @type {import('next/cache').CacheHandler}
 */
module.exports = {
  ...defaultCacheHandler,
  async set(cacheKey, pendingEntry) {
    const { tags } = await pendingEntry
    const outer = tags.find(
      (tag) => tag === 'nested-outer-one' || tag === 'nested-outer-two'
    )
    const isRedirect = tags.some((tag) => tag.startsWith('_N_RP_'))

    // Redirects are extra writes; count only each outer cache's value entry.
    if (outer !== undefined && !isRedirect) {
      observedOuters.add(outer)
      if (observedOuters.size === 2) {
        outerWrites.emit('complete')
      }
    }

    // Hold only the English prime; a French request calls just one outer.
    if (
      tags.includes('nested-language-en') &&
      outer === undefined &&
      !isRedirect
    ) {
      await pendingOuterWrites
    }

    return defaultCacheHandler.set(cacheKey, pendingEntry)
  },
}
