import type * as util from 'util'

import { parseAndSourceMap } from './patch-error-inspect'

export interface GetSourcemappedStackOptions {
  /**
   * Whether to include ANSI color codes in the output.
   * Defaults to false for compatibility with log aggregators.
   */
  colors?: boolean
}

/**
 * Returns a sourcemapped stack trace for the given error.
 *
 * Use this when you need programmatic access to sourcemapped stacks,
 * for example when using custom loggers like pino or error reporting
 * tools like Datadog or Sentry.
 *
 * @example
 * ```ts
 * import { getSourcemappedStack } from 'next/server'
 *
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   logger.error({
 *     message: error.message,
 *     stack: getSourcemappedStack(error as Error)
 *   })
 * }
 * ```
 */
export function getSourcemappedStack(
  error: Error,
  options?: GetSourcemappedStackOptions
): string {
  const inspectOptions: util.InspectOptions = {
    colors: options?.colors ?? false,
  }
  return parseAndSourceMap(error, inspectOptions)
}
