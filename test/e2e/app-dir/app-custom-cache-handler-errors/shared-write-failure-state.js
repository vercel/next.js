// @ts-check

/**
 * @typedef {object} SharedWriteFailureState
 * @property {string} id
 * @property {string[]} generatedValues
 * @property {boolean} writeStarted
 * @property {boolean} writeFailed
 * @property {boolean} joinerStarted
 * @property {boolean} joinerReadCompleted
 * @property {Promise<void> | null} pendingWrite
 * @property {(() => void) | null} releaseWrite
 */

/**
 * @type {typeof globalThis & { sharedWriteFailureState?: SharedWriteFailureState }}
 */
const reference = globalThis

module.exports = reference.sharedWriteFailureState ??= {
  id: '',
  generatedValues: [],
  writeStarted: false,
  writeFailed: false,
  joinerStarted: false,
  joinerReadCompleted: false,
  pendingWrite: null,
  releaseWrite: null,
}
