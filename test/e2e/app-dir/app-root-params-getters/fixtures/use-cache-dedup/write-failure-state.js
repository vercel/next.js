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
}
