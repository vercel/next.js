import { useEffect } from 'react'
import { handleClientError } from './use-error-handler'
import { isNextRouterError } from '../../../../client/components/is-next-router-error'
import { MISSING_ROOT_TAGS_ERROR } from '../../../../shared/lib/errors/constants'

function readSsrError(): (Error & { digest?: string }) | null {
  if (typeof document === 'undefined') {
    return null
  }

  const ssrErrorTemplateTag = document.querySelector(
    'template[data-next-error-message]'
  )
  if (ssrErrorTemplateTag) {
    const message: string = ssrErrorTemplateTag.getAttribute(
      'data-next-error-message'
    )!
    const stack = ssrErrorTemplateTag.getAttribute('data-next-error-stack')
    const digest = ssrErrorTemplateTag.getAttribute('data-next-error-digest')
    const error = new Error(message)
    if (digest) {
      ;(error as any).digest = digest
    }
    // Skip Next.js SSR'd internal errors that which will be handled by the error boundaries.
    if (isNextRouterError(error)) {
      return null
    }
    error.stack = stack || ''
    return error
  }

  return null
}

/**
 * Needs to be in the same error boundary as the shell.
 * If it commits, we know we recovered from an SSR error.
 * If it doesn't commit, we errored again and React will take care of error reporting.
 */
export function ReplaySsrOnlyErrors({
  onBlockingError,
}: {
  onBlockingError: () => void
}) {
  if (process.env.NODE_ENV !== 'production') {
    // Need to read during render. The attributes will be gone after commit.
    const ssrError = readSsrError()
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (ssrError !== null) {
        // TODO(veil): Include original Owner Stack (NDX-905)
        // TODO(veil): Mark as recoverable error
        // TODO(veil): console.error
        handleClientError(ssrError)

        // If it's missing root tags, we can't recover, make it blocking.
        if (ssrError.digest === MISSING_ROOT_TAGS_ERROR) {
          onBlockingError()
        }
      }
    }, [ssrError, onBlockingError])
  }

  return null
}
