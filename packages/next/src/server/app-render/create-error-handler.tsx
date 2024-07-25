import stringHash from 'next/dist/compiled/string-hash'
import { formatServerError } from '../../lib/format-server-error'
import { SpanStatusCode, getTracer } from '../lib/trace/tracer'
import { isAbortError } from '../pipe-readable'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isDynamicServerError } from '../../client/components/hooks-server-context'
import { isNextRouterError } from '../../client/components/is-next-router-error'

declare global {
  var __next_log_error__: undefined | ((err: unknown) => void)
}

export type ErrorHandler = (
  err: unknown,
  errorInfo: unknown
) => string | undefined

export type DigestedError = Error & { digest: string }

/**
 * Create error handler for renderers.
 * Tolerate dynamic server errors during prerendering so console
 * isn't spammed with unactionable errors
 */
export function createErrorHandler({
  dev,
  isNextExport,
  onReactStreamRenderError,
  getErrorByRenderSource,
  allCapturedErrors,
  silenceLogger,
}: {
  dev?: boolean
  isNextExport?: boolean
  onReactStreamRenderError?: (err: any) => void
  getErrorByRenderSource: (err: DigestedError) => Error
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

    if (allCapturedErrors) allCapturedErrors.push(err)

    // If the response was closed, we don't need to log the error.
    if (isAbortError(err)) return

    // If we're bailing out to CSR, we don't need to log the error.
    if (isBailoutToCSRError(err)) return err.digest

    // If this is a navigation error, we don't need to log the error.
    if (isNextRouterError(err)) return err.digest

    err = getErrorByRenderSource(err)

    // If this error occurs, we know that we should be stopping the static
    // render. This is only thrown in static generation when PPR is not enabled,
    // which causes the whole page to be marked as dynamic. We don't need to
    // tell the user about this error, as it's not actionable.
    if (isDynamicServerError(err)) return err.digest

    // Format server errors in development to add more helpful error messages
    if (dev) {
      formatServerError(err)
    }

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
        onReactStreamRenderError?.(err)
      }
    }

    return err.digest
  }
}
