// @ts-check

const cacheHandler = require('./throwing-cache-handler')
const sharedWriteFailureState = require('./shared-write-failure-state')

/**
 * @type {import('next/cache').CacheHandler}
 */
module.exports = {
  ...cacheHandler,
  async set(cacheKey, pendingEntry) {
    const entry = await pendingEntry
    if (
      !entry.tags.includes(`shared-write-failure:${sharedWriteFailureState.id}`)
    ) {
      return cacheHandler.set(cacheKey, pendingEntry)
    }

    sharedWriteFailureState.writeStarted = true
    await sharedWriteFailureState.pendingWrite
    sharedWriteFailureState.writeFailed = true
    throw new Error('expected shared cache write failure')
  },
}
