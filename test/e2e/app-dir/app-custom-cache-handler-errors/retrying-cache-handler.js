// @ts-check

// This handler rejects the first `get()` for the selected key. It pauses
// `set()` so the test can check that cached calls resolve before it completes.
const cacheHandler = require('./throwing-cache-handler')
const lookupRetryState = require('./lookup-retry-state')

/**
 * @type {import('next/cache').CacheHandler}
 */
module.exports = {
  ...cacheHandler,
  async get(cacheKey, softTags) {
    if (
      lookupRetryState.id !== '' &&
      cacheKey.includes(JSON.stringify(lookupRetryState.id))
    ) {
      lookupRetryState.lookupCount++
      if (lookupRetryState.failNextLookup) {
        lookupRetryState.failNextLookup = false
        throw new Error('expected cache lookup failure')
      }
    }
    return cacheHandler.get(cacheKey)
  },
  async set(cacheKey, pendingEntry) {
    const entry = await pendingEntry
    if (!entry.tags.includes(`lookup-retry:${lookupRetryState.id}`)) {
      return cacheHandler.set(cacheKey, pendingEntry)
    }
    lookupRetryState.writeStarted = true
    await lookupRetryState.pendingWrite
    if (lookupRetryState.failWrite) {
      lookupRetryState.writeFailed = true
      throw new Error('expected retained cache write failure')
    }
    await cacheHandler.set(cacheKey, pendingEntry)
    lookupRetryState.writeCompleted = true
  },
}
