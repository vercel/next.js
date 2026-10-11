import type { SerializedDiagnostic } from './events'
import { printDiffOrStringify } from '../../../compiled/next-test-primitives/diff'

export type DiagnosticOptions = Pick<SerializedDiagnostic, 'phase'> &
  Partial<Pick<SerializedDiagnostic, 'severity' | 'location' | 'frames'>> & {
    /** Producer-supplied mapping while the compiled artifact is retained. */
    mapStack?: (stack: string) => NonNullable<SerializedDiagnostic['frames']>
  }

function read(value: object, key: string): unknown {
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

/** Serialize at the producer, after its revision-specific source mapping. */
export function serializeDiagnostic(
  error: unknown,
  options: DiagnosticOptions
): SerializedDiagnostic {
  const seen = new Set<object>()
  // Bound the total aggregate expansion, including nested/sparse arrays.
  let aggregateErrorsRemaining = 1000
  function serialize(value: unknown, depth: number): SerializedDiagnostic {
    const diagnostic: SerializedDiagnostic = {
      phase: options.phase,
      severity: options.severity ?? 'error',
      message: 'Unknown thrown value',
    }
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    ) {
      diagnostic.message = String(value)
      return diagnostic
    }
    if (seen.has(value)) {
      diagnostic.message = '[Circular error cause]'
      return diagnostic
    }
    if (depth >= 10) {
      diagnostic.message = '[Error cause depth exceeded]'
      return diagnostic
    }
    seen.add(value)
    const message = read(value, 'message')
    const name = read(value, 'name')
    const stack = read(value, 'stack')
    const diff = read(value, 'diff')
    const cause = read(value, 'cause')
    const errors = read(value, 'errors')
    if (typeof message === 'string') diagnostic.message = message
    if (typeof name === 'string') diagnostic.name = name
    if (typeof diff === 'string') diagnostic.diff = diff
    else {
      const actual = read(value, 'actual')
      const expected = read(value, 'expected')
      const showDiff = read(value, 'showDiff')
      if (
        showDiff ||
        (showDiff === undefined &&
          actual !== undefined &&
          expected !== undefined)
      ) {
        try {
          diagnostic.diff = printDiffOrStringify(actual, expected)
        } catch {
          // Formatting user values must never replace the original assertion.
        }
      }
    }
    if (typeof stack === 'string') {
      diagnostic.stack = stack
      if (options.mapStack) {
        try {
          diagnostic.frames = options.mapStack(stack)
        } catch {
          // Preserve the raw stack if the producer cannot map it.
        }
      }
    }
    if (cause !== undefined) diagnostic.cause = serialize(cause, depth + 1)
    const unreadableAggregateError = (): SerializedDiagnostic => ({
      phase: options.phase,
      severity: options.severity ?? 'error',
      message: '[Unreadable aggregate error]',
    })
    try {
      if (Array.isArray(errors)) {
        diagnostic.errors = []
        const length = errors.length
        if (!Number.isSafeInteger(length) || length < 0) {
          throw new Error('Invalid aggregate length')
        }
        let index = 0
        for (; index < length && aggregateErrorsRemaining > 0; index++) {
          aggregateErrorsRemaining--
          try {
            // Do not dispatch through a user-controlled map or iterator.
            diagnostic.errors.push(serialize(errors[index], depth + 1))
          } catch {
            diagnostic.errors.push(unreadableAggregateError())
          }
        }
        if (index < length) {
          diagnostic.errors.push({
            phase: options.phase,
            severity: options.severity ?? 'error',
            message: `[${length - index} additional aggregate errors omitted]`,
          })
        }
      }
    } catch {
      // Array proxies can throw while checking their type or reading length.
      diagnostic.errors = [unreadableAggregateError()]
    }
    seen.delete(value)
    return diagnostic
  }
  const result = serialize(error, 0)
  // Source attribution is explicit; the test declaration is not an error site.
  if (options.location) result.location = { ...options.location }
  if (options.frames)
    result.frames = options.frames.map((frame) => ({ ...frame }))
  return result
}
