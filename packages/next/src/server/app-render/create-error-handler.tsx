import { DYNAMIC_ERROR_CODE } from '../../client/components/hooks-server-context'
import stringHash from 'next/dist/compiled/string-hash'
import { formatServerError } from '../../lib/format-server-error'
import { isNotFoundError } from '../../client/components/not-found'
import { isRedirectError } from '../../client/components/redirect'
import { NEXT_DYNAMIC_NO_SSR_CODE } from '../../shared/lib/lazy-dynamic/no-ssr-error'
import { SpanStatusCode, getTracer } from '../lib/trace/tracer'

export type ErrorHandler = (err: any) => string

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
}: {
  _source: string
  dev?: boolean
  isNextExport?: boolean
  errorLogger?: (err: any) => Promise<void>
  capturedErrors: Error[]
  allCapturedErrors?: Error[]
}): ErrorHandler {
  return (err: any): string => {
    if (allCapturedErrors) allCapturedErrors.push(err)

    if (
      err &&
      (err.digest === DYNAMIC_ERROR_CODE ||
        isNotFoundError(err) ||
        err.digest === NEXT_DYNAMIC_NO_SSR_CODE ||
        isRedirectError(err))
    ) {
      return err.digest
    }

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
        }
        if (process.env.NODE_ENV === 'production') {
          console.error(err)
        }
      }
    }

    capturedErrors.push(err)
    // TODO-APP: look at using webcrypto instead. Requires a promise to be awaited.
    return stringHash(err.message + err.stack + (err.digest || '')).toString()
  }
}
