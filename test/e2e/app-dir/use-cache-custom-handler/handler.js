// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default
const { AsyncLocalStorage } = require('node:async_hooks')
const snapshot = AsyncLocalStorage.snapshot()
const cacheWrites = require('./cache-writes')
const { EventEmitter, once } = require('node:events')
const outerWrites = new EventEmitter()
const pendingOuterWrites = once(outerWrites, 'complete')
const observedOuters = new Set()

/**
 * @type {import('next/cache').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey, softTags) {
    console.log('ModernCustomCacheHandler::get', cacheKey, softTags)
    return defaultCacheHandler.get(cacheKey, softTags)
  },

  async set(cacheKey, pendingEntry) {
    console.log('ModernCustomCacheHandler::set', cacheKey)

    const { stale, revalidate, expire, tags } = await pendingEntry
    snapshot(() => {
      console.log(
        `ModernCustomCacheHandler::set-resolved-entry revalidate: ${revalidate}, expire: ${expire}, tags: ${tags}\n  ${cacheKey}`
      )
    })

    // Copy tags so delayed propagation cannot change the recorded metadata.
    cacheWrites.push({ cacheKey, stale, revalidate, expire, tags: [...tags] })

    // Hold the inner write until both outer entries reach this handler. The
    // nested route calls `Outer1()` and then `Outer2()`, which share `Inner()`.
    // The second call must inherit the inner metadata while persistence is
    // still pending. The test checks the recorded tags and lifetimes for this
    // ordering.
    const outer = tags.find((tag) => tag === 'outer1' || tag === 'outer2')
    if (outer !== undefined) {
      observedOuters.add(outer)
      if (observedOuters.size === 2) {
        outerWrites.emit('complete')
      }
    }

    if (tags.includes('inner') && outer === undefined) {
      await pendingOuterWrites
    }

    return defaultCacheHandler.set(cacheKey, pendingEntry)
  },

  async refreshTags() {
    console.log('ModernCustomCacheHandler::refreshTags')
    return defaultCacheHandler.refreshTags()
  },

  async getExpiration(tags) {
    console.log('ModernCustomCacheHandler::getExpiration', JSON.stringify(tags))
    return defaultCacheHandler.getExpiration(tags)
  },

  async updateTags(tags) {
    console.log('ModernCustomCacheHandler::updateTags', JSON.stringify(tags))
    return defaultCacheHandler.updateTags(tags)
  },
}

module.exports = cacheHandler
