/**
 * Wrap an error thrown while loading the instrumentation hook in a new
 * `Error` with an informative prefix, preserving the original error via
 * `cause`.
 *
 * Avoids mutating the original error's `message` — which fails when the
 * thrown value is not an `Error` instance, or when `message` is defined
 * as a getter-only property (as happens with some validator libraries).
 */
export function wrapInstrumentationLoadError(err: unknown): Error {
  const originalMessage = err instanceof Error ? err.message : String(err)
  return new Error(
    `An error occurred while loading instrumentation hook: ${originalMessage}`,
    { cause: err }
  )
}
