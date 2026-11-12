/* eslint-disable import/no-extraneous-dependencies -- Build inputs are development dependencies; only the generated bundle ships. */
import { format } from '@vitest/pretty-format'
import {
  printDiffOrStringify,
  getDefaultFormatOptions,
} from '@vitest/utils/diff'
import { serializeError } from '@vitest/utils/error'

export { processError } from '@vitest/utils/error'

// Pinned 5.0.4 error preparation, with a private cache for already-copied errors.
// The SDK's MIT license is retained by the normal primitive generation task.
export function processTaskError(error, copies) {
  function aliasCache() {
    const originals = new WeakMap()
    for (const [original, copy] of copies) originals.set(copy, original)
    return new (class extends WeakMap {
      set(key, value) {
        super.set(key, value)
        const original = originals.get(key)
        if (original) super.set(original, value)
        const copy = copies.get(key)
        if (copy) super.set(copy, value)
        return this
      }
    })()
  }
  function processCopiedError(_err, diffOptions, seen = new WeakSet()) {
    if (!_err || typeof _err !== 'object') return { message: String(_err) }
    const err = _err
    if (
      err.showDiff ||
      (err.showDiff === undefined &&
        err.expected !== undefined &&
        err.actual !== undefined)
    ) {
      const options = { ...diffOptions, ...err.diffOptions }
      err.diff = printDiffOrStringify(err.actual, err.expected, options, err)
      err.expected = prettifyValue(err.expected, options)
      err.actual = prettifyValue(err.actual, options)
    }
    // Preserve the pinned preparation's exact cause visitation and assignment.
    try {
      if (!seen.has(err) && typeof err.cause === 'object') {
        seen.add(err)
        err.cause = processCopiedError(err.cause, diffOptions, seen)
      }
    } catch {}
    try {
      return serializeError(err, aliasCache())
    } catch (cause) {
      return serializeError(
        new Error(
          `Failed to fully serialize error: ${cause?.message}\nInner error message: ${err?.message}`
        ),
        aliasCache()
      )
    }
  }
  return processCopiedError(error)
}

function prettifyValue(value, options) {
  if (typeof value !== 'string')
    return format(value, getDefaultFormatOptions(options))
  return value
}
