// @ts-check

const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default
const writeFailureState = require('./write-failure-state')
const { EventEmitter, once } = require('node:events')
const outerWrites = new EventEmitter()
const pendingOuterWrites = once(outerWrites, 'complete')
const observedOuters = new Set()
/**
 * @type {Map<string, import('next/dist/server/lib/cache-handlers/types').CacheEntry>}
 */
const historyEntries = new Map()

/**
 * @param {string} cacheKey
 */
function readHistoryEntry(cacheKey) {
  const entry = historyEntries.get(cacheKey)
  if (entry === undefined) {
    return undefined
  }
  const [value, retained] = entry.value.tee()
  entry.value = retained
  return { ...entry, value }
}

/**
 * @param {string} cacheKey
 * @param {Promise<import('next/dist/server/lib/cache-handlers/types').CacheEntry>} pendingEntry
 */
async function saveHistoryEntry(cacheKey, pendingEntry) {
  const entry = await pendingEntry
  const [value, consumed] = entry.value.tee()
  const reader = consumed.getReader()
  while (!(await reader.read()).done) {}
  // This backend retains stale entries so an enclosing cache can require
  // generation after its redirected lookup returns.
  historyEntries.set(cacheKey, { ...entry, value })
}

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
  async get(cacheKey, softTags) {
    if (
      writeFailureState.id !== '' &&
      cacheKey.includes(JSON.stringify(writeFailureState.id))
    ) {
      writeFailureState.lookupKeys.push(cacheKey)
    }
    if (
      writeFailureState.lookupHistory &&
      cacheKey.includes(JSON.stringify(writeFailureState.id))
    ) {
      // The outer function has a different argument shape, so only the inner
      // function participates in these lookup barriers.
      if (!cacheKey.includes('"outer"')) {
        writeFailureState.initialLookupKey ||= cacheKey
        if (cacheKey === writeFailureState.initialLookupKey) {
          writeFailureState.initialLookupCount++
          if (writeFailureState.initialLookupCount === 2) {
            await writeFailureState.pendingInitialLookup
          }
        } else {
          writeFailureState.specificLookupCount++
          if (writeFailureState.specificLookupCount === 2) {
            const snapshot = readHistoryEntry(cacheKey)
            await writeFailureState.pendingSpecificLookup
            return snapshot
          }
        }
      }
    }
    return writeFailureState.lookupHistory &&
      cacheKey.includes(JSON.stringify(writeFailureState.id))
      ? readHistoryEntry(cacheKey)
      : defaultCacheHandler.get(cacheKey, softTags)
  },
  async set(cacheKey, pendingEntry) {
    const { tags } = await pendingEntry
    // Reject the English `set()` calls. The French request must still generate
    // and store an entry with its own root parameter value.
    if (tags.includes(`write-failure:${writeFailureState.id}`)) {
      if (tags.includes('write-failure-language:en')) {
        const role = tags.some((tag) => tag.startsWith('_N_RP_'))
          ? 'redirect'
          : 'value'
        writeFailureState.startedWrites.push(role)
        const secondGeneration = tags.includes(
          'app-root-params-getters:write-generation:2'
        )
        if (
          writeFailureState.lookupHistory &&
          secondGeneration &&
          role === 'value'
        ) {
          await writeFailureState.pendingSecondWrite
        } else if (
          writeFailureState.heldWrite === role &&
          (!writeFailureState.lookupHistory ||
            tags.includes('app-root-params-getters:write-generation:1'))
        ) {
          await writeFailureState.pendingWrite
        }
        if (
          writeFailureState.failedWrite === 'both' ||
          writeFailureState.failedWrite === role
        ) {
          writeFailureState.failedWriteLanguages.push('en')
          throw new Error('expected English cache write failure')
        }
        if (writeFailureState.lookupHistory) {
          await saveHistoryEntry(cacheKey, pendingEntry)
        } else {
          await defaultCacheHandler.set(cacheKey, pendingEntry)
        }
        writeFailureState.writtenLanguages.push('en')
        return
      }
      await defaultCacheHandler.set(cacheKey, pendingEntry)
      writeFailureState.writtenLanguages.push('fr')
      return
    }
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
