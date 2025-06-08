import {
  ACTION_BEFORE_REFRESH,
  ACTION_BUILD_ERROR,
  ACTION_BUILD_OK,
  ACTION_DEBUG_INFO,
  ACTION_DEV_INDICATOR,
  ACTION_REFRESH,
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
  ACTION_ERROR_OVERLAY_TOGGLE,
  ACTION_STATIC_INDICATOR,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  ACTION_VERSION_INFO,
  useErrorOverlayReducer,
  ACTION_BUILDING_INDICATOR_HIDE,
  ACTION_BUILDING_INDICATOR_SHOW,
  ACTION_RENDERING_INDICATOR_HIDE,
  ACTION_RENDERING_INDICATOR_SHOW,
} from './shared'

import { startTransition, useInsertionEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { FontStyles } from './font/font-styles'
import type { HydrationErrorState } from './pages/hydration-error-state'
import type { DebugInfo } from './types'
import { DevOverlay } from './ui/dev-overlay'
import type { DevIndicatorServerState } from '../../../server/dev/dev-indicator-server-state'
import type { VersionInfo } from '../../../server/dev/parse-version-info'

export interface Dispatcher {
  onBuildOk(): void
  onBuildError(message: string): void
  onVersionInfo(versionInfo: VersionInfo): void
  onDebugInfo(debugInfo: DebugInfo): void
  onBeforeRefresh(): void
  onRefresh(): void
  onStaticIndicator(status: boolean): void
  onDevIndicator(devIndicator: DevIndicatorServerState): void
  onUnhandledError(reason: Error): void
  onUnhandledRejection(reason: Error): void
  openErrorOverlay(): void
  closeErrorOverlay(): void
  toggleErrorOverlay(): void
  buildingIndicatorHide(): void
  buildingIndicatorShow(): void
  renderingIndicatorHide(): void
  renderingIndicatorShow(): void
}

type Dispatch = ReturnType<typeof useErrorOverlayReducer>[1]
let maybeDispatch: Dispatch | null = null
const queue: Array<(dispatch: Dispatch) => void> = []

// Events might be dispatched before we get a `dispatch` from React (e.g. console.error during module eval).
// We need to queue them until we have a `dispatch` function available.
function createQueuable<Args extends any[]>(
  queueableFunction: (dispatch: Dispatch, ...args: Args) => void
) {
  return (...args: Args) => {
    if (maybeDispatch) {
      queueableFunction(maybeDispatch, ...args)
    } else {
      queue.push((dispatch: Dispatch) => {
        queueableFunction(dispatch, ...args)
      })
    }
  }
}

// TODO: Extract into separate functions that are imported
export const dispatcher: Dispatcher = {
  onBuildOk: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_BUILD_OK })
  }),
  onBuildError: createQueuable((dispatch: Dispatch, message: string) => {
    dispatch({ type: ACTION_BUILD_ERROR, message })
  }),
  onBeforeRefresh: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_BEFORE_REFRESH })
  }),
  onRefresh: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_REFRESH })
  }),
  onVersionInfo: createQueuable(
    (dispatch: Dispatch, versionInfo: VersionInfo) => {
      dispatch({ type: ACTION_VERSION_INFO, versionInfo })
    }
  ),
  onStaticIndicator: createQueuable((dispatch: Dispatch, status: boolean) => {
    dispatch({ type: ACTION_STATIC_INDICATOR, staticIndicator: status })
  }),
  onDebugInfo: createQueuable((dispatch: Dispatch, debugInfo: DebugInfo) => {
    dispatch({ type: ACTION_DEBUG_INFO, debugInfo })
  }),
  onDevIndicator: createQueuable(
    (dispatch: Dispatch, devIndicator: DevIndicatorServerState) => {
      dispatch({ type: ACTION_DEV_INDICATOR, devIndicator })
    }
  ),
  onUnhandledError: createQueuable((dispatch: Dispatch, error: Error) => {
    dispatch({
      type: ACTION_UNHANDLED_ERROR,
      reason: error,
    })
  }),
  onUnhandledRejection: createQueuable((dispatch: Dispatch, error: Error) => {
    dispatch({
      type: ACTION_UNHANDLED_REJECTION,
      reason: error,
    })
  }),
  openErrorOverlay: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_ERROR_OVERLAY_OPEN })
  }),
  closeErrorOverlay: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
  }),
  toggleErrorOverlay: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_ERROR_OVERLAY_TOGGLE })
  }),
  buildingIndicatorHide: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_BUILDING_INDICATOR_HIDE })
  }),
  buildingIndicatorShow: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_BUILDING_INDICATOR_SHOW })
  }),
  renderingIndicatorHide: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_RENDERING_INDICATOR_HIDE })
  }),
  renderingIndicatorShow: createQueuable((dispatch: Dispatch) => {
    dispatch({ type: ACTION_RENDERING_INDICATOR_SHOW })
  }),
}

function replayQueuedEvents(dispatch: NonNullable<typeof maybeDispatch>) {
  try {
    for (const queuedFunction of queue) {
      queuedFunction(dispatch)
    }
  } finally {
    // TODO: What to do with failed events?
    queue.length = 0
  }
}

function DevOverlayRoot({
  getComponentStack,
  getOwnerStack,
  getSquashedHydrationErrorDetails,
  isRecoverableError,
  routerType,
}: {
  getComponentStack: (error: Error) => string | undefined
  getOwnerStack: (error: Error) => string | null | undefined
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
  isRecoverableError: (error: Error) => boolean
  routerType: 'app' | 'pages'
}) {
  const [state, dispatch] = useErrorOverlayReducer(
    routerType,
    getComponentStack,
    getOwnerStack,
    isRecoverableError
  )

  useInsertionEffect(() => {
    maybeDispatch = dispatch

    // Can't schedule updates from useInsertionEffect, so we need to defer.
    // Could move this into a passive Effect but we don't want replaying when
    // we reconnect.
    const replayTimeout = setTimeout(() => {
      replayQueuedEvents(dispatch)
    })

    return () => {
      maybeDispatch = null
      clearTimeout(replayTimeout)
    }
  }, [])

  return (
    <>
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

let isPagesMounted = false
let isAppMounted = false

function getSquashedHydrationErrorDetailsApp() {
  // We don't squash hydration errors in the App Router.
  return null
}

export function renderAppDevOverlay(
  getComponentStack: (error: Error) => string | undefined,
  getOwnerStack: (error: Error) => string | null | undefined,
  isRecoverableError: (error: Error) => boolean
): void {
  if (isPagesMounted) {
    // Switching between App and Pages Router is always a hard navigation
    // TODO: Support soft navigation between App and Pages Router
    throw new Error(
      'Next DevTools: Pages Dev Overlay is already mounted. This is a bug in Next.js'
    )
  }

  if (!isAppMounted) {
    // React 19 will not throw away `<script>` elements in a container it owns.
    // This ensures the actual user-space React does not unmount the Dev Overlay.
    const script = document.createElement('script')
    script.style.display = 'block'
    // Although the style applied to the shadow host is isolated,
    // the element that attached the shadow host (i.e. "script")
    // is still affected by the parent's style (e.g. "body"). This may
    // occur style conflicts like "display: flex", with other children
    // elements therefore give the shadow host an absolute position.
    script.style.position = 'absolute'
    script.setAttribute('data-nextjs-dev-overlay', 'true')

    const container = document.createElement('nextjs-portal')

    script.appendChild(container)
    document.body.appendChild(script)

    const root = createRoot(container, {
      identifierPrefix: 'ndt-',
    })

    startTransition(() => {
      // TODO: Dedicated error boundary or root error callbacks?
      // At least it won't unmount any user code if it errors.
      root.render(
        <DevOverlayRoot
          getComponentStack={getComponentStack}
          getOwnerStack={getOwnerStack}
          getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetailsApp}
          isRecoverableError={isRecoverableError}
          routerType="app"
        />
      )
    })

    isAppMounted = true
  }
}

export function renderPagesDevOverlay(
  getComponentStack: (error: Error) => string | undefined,
  getOwnerStack: (error: Error) => string | null | undefined,
  getSquashedHydrationErrorDetails: (
    error: Error
  ) => HydrationErrorState | null,
  isRecoverableError: (error: Error) => boolean
): void {
  if (isAppMounted) {
    // Switching between App and Pages Router is always a hard navigation
    // TODO: Support soft navigation between App and Pages Router
    throw new Error(
      'Next DevTools: App Dev Overlay is already mounted. This is a bug in Next.js'
    )
  }

  if (!isPagesMounted) {
    const container = document.createElement('nextjs-portal')
    // Although the style applied to the shadow host is isolated,
    // the element that attached the shadow host (i.e. "script")
    // is still affected by the parent's style (e.g. "body"). This may
    // occur style conflicts like "display: flex", with other children
    // elements therefore give the shadow host an absolute position.
    container.style.position = 'absolute'

    // Pages Router runs with React 18 or 19 so we can't use the same trick as with
    // App Router. We just reconnect the container if React wipes it e.g. when
    // we recover from a shell error via createRoot()
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.removedNodes) {
            if (node === container) {
              // Reconnect the container to the body
              document.body.appendChild(container)
            }
          }
        }
      }
    }).observe(document.body, {
      childList: true,
    })
    document.body.appendChild(container)

    const root = createRoot(container)

    startTransition(() => {
      // TODO: Dedicated error boundary or root error callbacks?
      // At least it won't unmount any user code if it errors.
      root.render(
        <DevOverlayRoot
          getComponentStack={getComponentStack}
          getOwnerStack={getOwnerStack}
          getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetails}
          isRecoverableError={isRecoverableError}
          routerType="pages"
        />
      )
    })

    isPagesMounted = true
  }
}
