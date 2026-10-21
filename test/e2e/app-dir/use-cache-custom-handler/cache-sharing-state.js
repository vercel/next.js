// @ts-check

/**
 * The fixture routes and cache handler share these lookup and generation
 * controls.
 *
 * @typedef {object} CacheSharingState
 * @property {string[][]} softTags
 * Implicit tags from `get()` calls for `path-revalidation` entries.
 * @property {string[]} startedRoutes
 * Routes that have started a cached call.
 * @property {Promise<void> | null} pendingEntryLookup
 * Pauses `get()` for entries tagged `path-revalidation`.
 * @property {(() => void) | null} releaseEntryLookup
 * @property {string[]} fills
 * IDs whose cached functions have started execution.
 * @property {string[]} writes
 * Tags from completed handler writes.
 * @property {string[]} routeBLookupKeys
 * Keys read by route B during the concurrent fill tests.
 * @property {Promise<void> | null} pendingFill
 * Pauses execution of the cached function.
 * @property {(() => void) | null} releaseFill
 * @property {Promise<void> | null} pendingRouteLookupResult
 * Pauses route B's `get()` before it returns.
 * @property {(() => void) | null} releaseRouteLookupResult
 */

/**
 * @type {typeof globalThis & { cacheSharingState?: CacheSharingState }}
 */
const reference = globalThis

module.exports = reference.cacheSharingState ??= {
  softTags: [],
  startedRoutes: [],
  pendingEntryLookup: null,
  releaseEntryLookup: null,
  fills: [],
  writes: [],
  routeBLookupKeys: [],
  pendingFill: null,
  releaseFill: null,
  pendingRouteLookupResult: null,
  releaseRouteLookupResult: null,
}
