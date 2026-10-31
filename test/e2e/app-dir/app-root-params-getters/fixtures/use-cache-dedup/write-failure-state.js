// @ts-check

/**
 * The page, cached function, and handler share these generation controls and
 * language records.
 *
 * @typedef {object} WriteFailureState
 * @property {string} id
 * @property {string[]} requestedLanguages
 * Languages requested by the pages.
 * @property {string[]} generatedLanguages
 * Languages read by the cached function.
 * @property {string[]} failedWriteLanguages
 * Languages whose `set()` calls reject.
 * @property {string[]} writtenLanguages
 * Languages written by the default handler.
 * @property {Promise<void> | null} pendingFill
 * Keeps `readCachedValue()` pending.
 * @property {(() => void) | null} releaseFill
 * @property {'redirect' | 'value' | null} heldWrite
 * @property {'both' | 'redirect' | 'value' | null} failedWrite
 * @property {string[]} startedWrites
 * @property {string[]} lookupKeys
 * @property {Promise<void> | null} pendingWrite
 * @property {(() => void) | null} releaseWrite
 * @property {boolean} lookupHistory
 * @property {string} initialLookupKey
 * @property {number} initialLookupCount
 * @property {number} specificLookupCount
 * @property {Promise<void> | null} pendingInitialLookup
 * @property {(() => void) | null} releaseInitialLookup
 * @property {Promise<void> | null} pendingSpecificLookup
 * @property {(() => void) | null} releaseSpecificLookup
 * @property {Promise<void> | null} pendingSecondWrite
 * @property {(() => void) | null} releaseSecondWrite
 */

/**
 * @type {typeof globalThis & { writeFailureState?: WriteFailureState }}
 */
const reference = globalThis

module.exports = reference.writeFailureState ??= {
  id: '',
  requestedLanguages: [],
  generatedLanguages: [],
  failedWriteLanguages: [],
  writtenLanguages: [],
  pendingFill: null,
  releaseFill: null,
  heldWrite: null,
  failedWrite: 'both',
  startedWrites: [],
  lookupKeys: [],
  pendingWrite: null,
  releaseWrite: null,
  lookupHistory: false,
  initialLookupKey: '',
  initialLookupCount: 0,
  specificLookupCount: 0,
  pendingInitialLookup: null,
  releaseInitialLookup: null,
  pendingSpecificLookup: null,
  releaseSpecificLookup: null,
  pendingSecondWrite: null,
  releaseSecondWrite: null,
}
