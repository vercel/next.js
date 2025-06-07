import { useInsertionEffect } from 'react'
import { PagesDevOverlayErrorBoundary } from './pages-dev-overlay-error-boundary'
import { usePagesDevOverlay } from './hooks'
import { FontStyles } from '../font/font-styles'
import { DevOverlay } from '../ui/dev-overlay'
import { getSquashedHydrationErrorDetails } from './hydration-error-state'

export type ErrorType = 'runtime' | 'build'

export type PagesDevOverlayType = typeof PagesDevOverlay

interface PagesDevOverlayProps {
  children?: React.ReactNode
}

export function PagesDevOverlay({ children }: PagesDevOverlayProps) {
  const { state, dispatch } = usePagesDevOverlay()

  // TODO: Remove once Root initializer creates this element
  useInsertionEffect(() => {
    const container = document.createElement('nextjs-portal')
    document.body.appendChild(container)
  }, [])

  return (
    <>
      <PagesDevOverlayErrorBoundary>{children}</PagesDevOverlayErrorBoundary>

      {/* Fonts can only be loaded outside the Shadow DOM. */}
      <FontStyles />
      <DevOverlay
        state={state}
        dispatch={dispatch}
        getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetails}
      />
    </>
  )
}
