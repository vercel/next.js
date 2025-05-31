import { PagesDevOverlayErrorBoundary } from './pages-dev-overlay-error-boundary'
import { usePagesDevOverlay } from './hooks'
import { FontStyles } from '../font/font-styles'
import { DevOverlay } from '../ui/dev-overlay'

export type ErrorType = 'runtime' | 'build'

export type PagesDevOverlayType = typeof PagesDevOverlay

interface PagesDevOverlayProps {
  children?: React.ReactNode
}

export function PagesDevOverlay({ children }: PagesDevOverlayProps) {
  const { state, dispatch, onComponentError } = usePagesDevOverlay()

  return (
    <>
      <PagesDevOverlayErrorBoundary onError={onComponentError}>
        {children ?? null}
      </PagesDevOverlayErrorBoundary>

      {/* Fonts can only be loaded outside the Shadow DOM. */}
      <FontStyles />
      <DevOverlay state={state} dispatch={dispatch} />
    </>
  )
}
