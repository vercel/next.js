import type { OverlayState } from '../shared'
import type { GlobalErrorComponent } from '../../error-boundary'

import { useState } from 'react'
import { AppDevOverlayErrorBoundary } from './app-dev-overlay-error-boundary'
import { FontStyles } from '../font/font-styles'
import { DevOverlay } from '../ui/dev-overlay'

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

  return (
    <>
      <AppDevOverlayErrorBoundary
        globalError={globalError}
        onError={setIsErrorOverlayOpen}
      >
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
