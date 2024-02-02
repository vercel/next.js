import stringHash from 'next/dist/compiled/string-hash'
import { formatServerError } from '../../lib/format-server-error'
import { SpanStatusCode, getTracer } from '../lib/trace/tracer'
import { isAbortError } from '../pipe-readable'
import { isDynamicUsageError } from '../../export/helpers/is-dynamic-usage-error'

export type ErrorHandler = (
  err: unknown,
  errorInfo: unknown
) => string | undefined

/**
 * Create error handler for renderers.
 * Tolerate dynamic server errors during prerendering so console
 * isn't spammed with unactionable errors
 */
export function createErrorHandler({
  /**
   * Used for debugging
   */
  _source,
  dev,
  isNextExport,
  errorLogger,
  capturedErrors,
  allCapturedErrors,
  silenceLogger,
}: {
  _source: string
  dev?: boolean
  isNextExport?: boolean
  errorLogger?: (err: any) => Promise<void>
  capturedErrors: Error[]
  allCapturedErrors?: Error[]
  silenceLogger?: boolean
}): ErrorHandler {
  return (err: any, errorInfo: any) => {
    if (allCapturedErrors) allCapturedErrors.push(err)

    // These errors are expected. We return the digest
    // so that they can be properly handled.
    if (isDynamicUsageError(err)) return err.digest

    // If the response was closed, we don't need to log the error.
    if (isAbortError(err)) return

    // Format server errors in development to add more helpful error messages
    if (dev) {
      formatServerError(err)
    }
    // Used for debugging error source
    // console.error(_source, err)
    // Don't log the suppressed error during export
    if (
      !(
        isNextExport &&
        err?.message?.includes(
          'The specific message is omitted in production builds to avoid leaking sensitive details.'
        )
      )
    ) {
      // Record exception in an active span, if available.
      const span = getTracer().getActiveScopeSpan()
      if (span) {
        span.recordException(err)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message,
        })
      }

      if (!silenceLogger) {
        if (errorLogger) {
          errorLogger(err).catch(() => {})
        } else {
          // The error logger is currently not provided in the edge runtime.
          // Use `log-app-dir-error` instead.
          // It won't log the source code, but the error will be more useful.
          if (process.env.NODE_ENV !== 'production') {
            const { logAppDirError } =
              require('../dev/log-app-dir-error') as typeof import('../dev/log-app-dir-error')
            logAppDirError(err)
          } else {
            console.error(err)
          }
        }
      }
    }

    // If the error already has a digest, respect the original digest,
    // so it won't get re-generated into another new error.
    if (!err.digest) {
      // TODO-APP: look at using webcrypto instead. Requires a promise to be awaited.
      const computedDigest = stringHash(
        err.message + (err.stack || errorInfo.stack || '')
      ).toString()
      err.digest = computedDigest
    }

    capturedErrors.push(err)

    return err.digest
  }
}
