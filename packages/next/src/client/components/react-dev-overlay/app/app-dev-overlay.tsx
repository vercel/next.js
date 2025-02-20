import type { OverlayState } from '../shared'
import type { GlobalErrorComponent } from '../../error-boundary'

import { useState } from 'react'
import { DevOverlayErrorBoundary } from './error-boundary'
import { DevOverlay } from '../_internal/dev-overlay'

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
  const devOverlay = (
    <DevOverlay
      state={state}
      isErrorOverlayOpen={isErrorOverlayOpen}
      setIsErrorOverlayOpen={setIsErrorOverlayOpen}
    />
  )

  return (
    <DevOverlayErrorBoundary
      devOverlay={devOverlay}
      globalError={globalError}
      onError={setIsErrorOverlayOpen}
    >
      {children}
    </DevOverlayErrorBoundary>
  )
}
