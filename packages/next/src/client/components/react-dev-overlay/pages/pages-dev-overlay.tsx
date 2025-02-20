import { useState } from 'react'
import { PagesDevOverlayErrorBoundary } from './pages-dev-overlay-error-boundary'
import { usePagesDevOverlay } from './hooks'
import { DevOverlay } from '../_internal/dev-overlay'

export type ErrorType = 'runtime' | 'build'

export type PagesDevOverlayType = typeof PagesDevOverlay

interface PagesDevOverlayProps {
  children?: React.ReactNode
}

export function PagesDevOverlay({ children }: PagesDevOverlayProps) {
  const { state, onComponentError } = usePagesDevOverlay()

  const [isErrorOverlayOpen, setIsErrorOverlayOpen] = useState(true)

  return (
    <>
      <PagesDevOverlayErrorBoundary onError={onComponentError}>
        {children ?? null}
      </PagesDevOverlayErrorBoundary>

      <DevOverlay
        state={state}
        isErrorOverlayOpen={isErrorOverlayOpen}
        setIsErrorOverlayOpen={setIsErrorOverlayOpen}
      />
    </>
  )
}
