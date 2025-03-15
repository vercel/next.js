import type { OverlayState } from '../shared'
import type { GlobalErrorComponent } from '../../error-boundary'

import { useCallback, useEffect, useState } from 'react'
import { AppDevOverlayErrorBoundary } from './app-dev-overlay-error-boundary'
import { FontStyles } from '../font/font-styles'
import { DevOverlay } from '../ui/dev-overlay'
import { handleClientError } from '../../errors/use-error-handler'
import { isNextRouterError } from '../../is-next-router-error'

function readSsrError(): Error | null {
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

// Needs to be in the same error boundary as the shell.
// If it commits, we know we recovered from an SSR error.
// If it doesn't commit, we errored again and React will take care of error reporting.
function ReplaySsrOnlyErrors({ onError }: { onError: () => void }) {
  if (process.env.NODE_ENV !== 'production') {
    // Need to read during render. The attributes will be gone after commit.
    const ssrError = readSsrError()
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (ssrError !== null) {
        // TODO(veil): Produces wrong Owner Stack
        // TODO(veil): Mark as recoverable error
        // TODO(veil): console.error
        handleClientError(ssrError, [])
        onError()
      }
    }, [ssrError, onError])
  }

  return null
}

export function AppDevOverlay({
  state,
  globalError,
  children,
}: {
  state: OverlayState
  globalError: [GlobalErrorComponent, React.ReactNode]
  children: React.ReactNode
}) {
  const [isErrorOverlayOpen, setIsErrorOverlayOpen] = useState(false)
  const openOverlay = useCallback(() => setIsErrorOverlayOpen(true), [])

  return (
    <>
      <AppDevOverlayErrorBoundary
        globalError={globalError}
        onError={setIsErrorOverlayOpen}
      >
        <ReplaySsrOnlyErrors onError={openOverlay} />
        {children}
      </AppDevOverlayErrorBoundary>

      {/* Fonts can only be loaded outside the Shadow DOM. */}
      <FontStyles />
      <DevOverlay
        state={state}
        isErrorOverlayOpen={isErrorOverlayOpen}
        setIsErrorOverlayOpen={setIsErrorOverlayOpen}
      />
    </>
  )
}
