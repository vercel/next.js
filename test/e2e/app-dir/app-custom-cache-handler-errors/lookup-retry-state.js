// @ts-check

/**
 * The route and cache handler share these lookup and write controls.
 *
 * @typedef {object} LookupRetryState
 * @property {string} id
 * @property {boolean} failNextLookup
 * @property {number} lookupCount
 * @property {boolean} writeStarted
 * @property {boolean} writeCompleted
 * @property {boolean} cacheReadsCompleted
 * Records that the route's cached calls have settled.
 * @property {Promise<void> | null} pendingWrite
 * Keeps `set()` pending after it receives the cache entry.
 * @property {(() => void) | null} releaseWrite
 */

/**
 * @type {typeof globalThis & { lookupRetryState?: LookupRetryState }}
 */
const reference = globalThis

module.exports = reference.lookupRetryState ??= {
  id: '',
  failNextLookup: false,
  lookupCount: 0,
  writeStarted: false,
  writeCompleted: false,
  cacheReadsCompleted: false,
  pendingWrite: null,
  releaseWrite: null,
}
