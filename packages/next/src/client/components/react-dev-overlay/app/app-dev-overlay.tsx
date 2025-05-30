import {
  ACTION_ERROR_OVERLAY_OPEN,
  type OverlayDispatch,
  type OverlayState,
} from '../shared'
import type { GlobalErrorComponent } from '../../global-error'

import { useCallback } from 'react'
import { createContext } from 'react'
import { AppDevOverlayErrorBoundary } from './app-dev-overlay-error-boundary'
import { FontStyles } from '../font/font-styles'
import { DevOverlay } from '../ui/dev-overlay'

function getSquashedHydrationErrorDetails() {
  // We don't squash hydration errors in the App Router.
  return null
}

export const AppDevOverlayDispatchContext =
  createContext<OverlayDispatch | null>(null)
AppDevOverlayDispatchContext.displayName = 'AppDevOverlayDispatchContext'

export function AppDevOverlay({
  state,
  dispatch,
  globalError,
  children,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  globalError: [GlobalErrorComponent, React.ReactNode]
  children: React.ReactNode
}) {
  const openOverlay = useCallback(() => {
    dispatch({ type: ACTION_ERROR_OVERLAY_OPEN })
  }, [dispatch])

  return (
    <AppDevOverlayDispatchContext value={dispatch}>
      <AppDevOverlayErrorBoundary
        globalError={globalError}
        onError={openOverlay}
      >
        {children}
      </AppDevOverlayErrorBoundary>
      <>
        {/* Fonts can only be loaded outside the Shadow DOM. */}
        <FontStyles />
        <DevOverlay
          state={state}
          dispatch={dispatch}
          getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetails}
        />
      </>
    </AppDevOverlayDispatchContext>
  )
}
