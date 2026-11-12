import type { DiffOptions } from './diff'
import type { TestError } from './types'
import { format as prettyFormat } from '../pretty-format/index'
import { getDefaultFormatOptions, printDiffOrStringify } from './diff'
import { serializeValue } from './serialize'

export { serializeValue as serializeError }

export function processError(
  _err: any,
  diffOptions?: DiffOptions,
  seen: WeakSet<WeakKey> = new WeakSet()
): TestError {
  if (!_err || typeof _err !== 'object') {
    return { message: String(_err) }
  }
  const err = _err as TestError

  if (
    err.showDiff ||
    (err.showDiff === undefined &&
      err.expected !== undefined &&
      err.actual !== undefined)
  ) {
    const options = {
      ...diffOptions,
      ...(err.diffOptions as DiffOptions),
    }
    err.diff = printDiffOrStringify(err.actual, err.expected, options, err)

    err.expected = prettifyValue(err.expected, options)
    err.actual = prettifyValue(err.actual, options)
  }

  // some Error implementations may not allow rewriting cause
  // in most cases, the assignment will lead to "err.cause = err.cause"
  try {
    if (!seen.has(err) && typeof err.cause === 'object') {
      seen.add(err)
      err.cause = processError(err.cause, diffOptions, seen)
    }
  } catch {}

  try {
    return serializeValue(err)
  } catch (e: any) {
    return serializeValue(
      new Error(
        `Failed to fully serialize error: ${e?.message}\nInner error message: ${err?.message}`
      )
    )
  }
}

function prettifyValue(
  value: unknown,
  options: DiffOptions
): string | undefined {
  if (typeof value !== 'string') {
    return prettyFormat(value, getDefaultFormatOptions(options))
  }
  return value
}

/** Serialize task errors while preserving aliases to their original values. */
export function processTaskError(
  error: unknown,
  copies: ReadonlyMap<object, object>
): TestError {
  function aliasCache(): WeakMap<WeakKey, any> {
    const originals = new WeakMap<object, object>()
    for (const [original, copy] of copies) originals.set(copy, original)
    return new (class extends WeakMap<WeakKey, any> {
      set(key: WeakKey, value: any): this {
        super.set(key, value)
        if (typeof key !== 'symbol') {
          const original = originals.get(key)
          if (original) super.set(original, value)
          const copy = copies.get(key)
          if (copy) super.set(copy, value)
        }
        return this
      }
    })()
  }
  function processCopiedError(
    _err: any,
    diffOptions?: DiffOptions,
    seen: WeakSet<object> = new WeakSet()
  ): TestError {
    if (!_err || typeof _err !== 'object') return { message: String(_err) }
    const err = _err as TestError
    if (
      err.showDiff ||
      (err.showDiff === undefined &&
        err.expected !== undefined &&
        err.actual !== undefined)
    ) {
      const options = { ...diffOptions, ...(err.diffOptions as DiffOptions) }
      err.diff = printDiffOrStringify(err.actual, err.expected, options, err)
      err.expected = prettifyValue(err.expected, options)
      err.actual = prettifyValue(err.actual, options)
    }
    try {
      if (!seen.has(err) && typeof err.cause === 'object') {
        seen.add(err)
        err.cause = processCopiedError(err.cause, diffOptions, seen)
      }
    } catch {}
    try {
      return serializeValue(err, aliasCache())
    } catch (cause: any) {
      return serializeValue(
        new Error(
          `Failed to fully serialize error: ${cause?.message}\nInner error message: ${err?.message}`
        ),
        aliasCache()
      )
    }
  }
  return processCopiedError(error)
}
