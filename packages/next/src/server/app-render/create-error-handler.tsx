import stringHash from 'next/dist/compiled/string-hash'
import { formatServerError } from '../../lib/format-server-error'
import { SpanStatusCode, getTracer } from '../lib/trace/tracer'
import { isAbortError } from '../pipe-readable'
import { isDynamicUsageError } from '../../export/helpers/is-dynamic-usage-error'

export type ErrorHandler = (
  err: unknown,
  errorInfo: unknown
) => string | undefined

export const ErrorHandlerSource = {
  serverComponents: 'serverComponents',
  flightData: 'flightData',
  html: 'html',
} as const

/**
 * Create error handler for renderers.
 * Tolerate dynamic server errors during prerendering so console
 * isn't spammed with unactionable errors
 */
export function createErrorHandler({
  /**
   * Used for debugging
   */
  source,
  dev,
  isNextExport,
  errorLogger,
  digestErrorsMap,
  allCapturedErrors,
  silenceLogger,
}: {
  source: (typeof ErrorHandlerSource)[keyof typeof ErrorHandlerSource]
  dev?: boolean
  isNextExport?: boolean
  errorLogger?: (err: any) => Promise<void>
  digestErrorsMap: Map<string, Error>
  allCapturedErrors?: Error[]
  silenceLogger?: boolean
}): ErrorHandler {
  return (err: any, errorInfo: any) => {
    // If the error already has a digest, respect the original digest,
    // so it won't get re-generated into another new error.
    if (!err.digest) {
      // TODO-APP: look at using webcrypto instead. Requires a promise to be awaited.
      err.digest = stringHash(
        err.message + (errorInfo?.stack || err.stack || '')
      ).toString()
    }
    const digest = err.digest

    if (allCapturedErrors) allCapturedErrors.push(err)

    // These errors are expected. We return the digest
    // so that they can be properly handled.
    if (isDynamicUsageError(err)) return err.digest

    // If the response was closed, we don't need to log the error.
    if (isAbortError(err)) return

    if (!digestErrorsMap.has(digest)) {
      digestErrorsMap.set(digest, err)
    } else if (source === ErrorHandlerSource.html) {
      // For SSR errors, if we have the existing digest in errors map,
      // we should use the existing error object to avoid duplicate error logs.
      err = digestErrorsMap.get(digest)
    }

    // Format server errors in development to add more helpful error messages
    if (dev) {
      formatServerError(err)
    }
    // Used for debugging error source
    // console.error(source, err)
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

    return err.digest
  }
}
