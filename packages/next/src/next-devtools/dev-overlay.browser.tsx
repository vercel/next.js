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
  ACTION_DEVTOOL_UPDATE_ROUTE_STATE,
  ACTION_DEVTOOLS_CONFIG,
  type OverlayState,
  type DispatcherEvent,
  ACTION_CACHE_INDICATOR,
} from './dev-overlay/shared'

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  type ActionDispatch,
} from 'react'
import { createRoot } from 'react-dom/client'
import type { CacheIndicatorState } from './dev-overlay/cache-indicator'
import { FontStyles } from './dev-overlay/font/font-styles'
import type { HydrationErrorState } from './shared/hydration-error'
import type { DebugInfo } from './shared/types'
import { DevOverlay } from './dev-overlay/dev-overlay'
import type { DevIndicatorServerState } from '../server/dev/dev-indicator-server-state'
import type { VersionInfo } from '../server/dev/parse-version-info'
import {
  insertSegmentNode,
  removeSegmentNode,
  getSegmentTrieRoot,
} from './dev-overlay/segment-explorer-trie'
import type { SegmentNodeState } from './userspace/app/segment-explorer-node'
import type { DevToolsConfig } from './dev-overlay/shared'
import type { SegmentTrieData } from '../shared/lib/mcp-page-metadata-types'

export interface Dispatcher {
  onBuildOk(): void
  onBuildError(message: string): void
  onVersionInfo(versionInfo: VersionInfo): void
  onDebugInfo(debugInfo: DebugInfo): void
  onBeforeRefresh(): void
  onRefresh(): void
  onCacheIndicator(status: CacheIndicatorState): void
  onStaticIndicator(status: 'pending' | 'static' | 'dynamic' | 'disabled'): void
  onDevIndicator(devIndicator: DevIndicatorServerState): void
  onDevToolsConfig(config: DevToolsConfig): void
  onUnhandledError(reason: Error): void
  onUnhandledRejection(reason: Error): void
  openErrorOverlay(): void
  closeErrorOverlay(): void
  toggleErrorOverlay(): void
  buildingIndicatorHide(): void
  buildingIndicatorShow(): void
  renderingIndicatorHide(): void
  renderingIndicatorShow(): void
  segmentExplorerNodeAdd(nodeState: SegmentNodeState): void
  segmentExplorerNodeRemove(nodeState: SegmentNodeState): void
  segmentExplorerUpdateRouteState(page: string): void
}

type Dispatch = ReturnType<typeof useErrorOverlayReducer>[1]
let maybeDispatch: Dispatch | null = null
const queue: Array<(dispatch: Dispatch) => void> = []

// Global state store for accessing current overlay state from outside React context
type OverlayStateWithRouter = OverlayState & { routerType: 'pages' | 'app' }

let currentOverlayState: OverlayStateWithRouter | null = null

export function getSerializedOverlayState(): OverlayStateWithRouter | null {
  // Serialize error objects properly since Error properties are non-enumerable
  // This is used when sending state via HMR/JSON.stringify
  if (!currentOverlayState) return null

  return {
    ...currentOverlayState,
    errors: currentOverlayState.errors.map((errorEvent: any) => ({
      ...errorEvent,
      error: errorEvent.error
        ? {
            name: errorEvent.error.name,
            message: errorEvent.error.message,
            stack: errorEvent.error.stack,
          }
        : null,
    })),
  }
}

export function getSegmentTrieData(): SegmentTrieData | null {
  if (!currentOverlayState) {
    return null
  }
  const trieRoot = getSegmentTrieRoot()
  return {
    segmentTrie: trieRoot,
    routerType: currentOverlayState.routerType,
  }
}

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
  onCacheIndicator: createQueuable(
    (dispatch: Dispatch, status: CacheIndicatorState) => {
      dispatch({ type: ACTION_CACHE_INDICATOR, cacheIndicator: status })
    }
  ),
  onStaticIndicator: createQueuable(
    (
      dispatch: Dispatch,
      status: 'pending' | 'static' | 'dynamic' | 'disabled'
    ) => {
      dispatch({ type: ACTION_STATIC_INDICATOR, staticIndicator: status })
    }
  ),
  onDebugInfo: createQueuable((dispatch: Dispatch, debugInfo: DebugInfo) => {
    dispatch({ type: ACTION_DEBUG_INFO, debugInfo })
  }),
  onDevIndicator: createQueuable(
    (dispatch: Dispatch, devIndicator: DevIndicatorServerState) => {
      dispatch({ type: ACTION_DEV_INDICATOR, devIndicator })
    }
  ),
  onDevToolsConfig: createQueuable(
    (dispatch: Dispatch, devToolsConfig: DevToolsConfig) => {
      dispatch({ type: ACTION_DEVTOOLS_CONFIG, devToolsConfig })
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
  segmentExplorerNodeAdd: createQueuable(
    (_: Dispatch, nodeState: SegmentNodeState) => {
      insertSegmentNode(nodeState)
    }
  ),
  segmentExplorerNodeRemove: createQueuable(
    (_: Dispatch, nodeState: SegmentNodeState) => {
      removeSegmentNode(nodeState)
    }
  ),
  segmentExplorerUpdateRouteState: createQueuable(
    (dispatch: Dispatch, page: string) => {
      dispatch({ type: ACTION_DEVTOOL_UPDATE_ROUTE_STATE, page })
    }
  ),
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
  enableCacheIndicator,
  getOwnerStack,
  getSquashedHydrationErrorDetails,
  isRecoverableError,
  routerType,
  shadowRoot,
}: {
  enableCacheIndicator: boolean
  getOwnerStack: (error: Error) => string | null | undefined
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
  isRecoverableError: (error: Error) => boolean
  routerType: 'app' | 'pages'
  shadowRoot: ShadowRoot
}) {
  const [state, dispatch] = useErrorOverlayReducer(
    routerType,
    getOwnerStack,
    isRecoverableError,
    enableCacheIndicator
  )

  useEffect(() => {
    currentOverlayState = { ...state, routerType }
  }, [state, routerType])

  useLayoutEffect(() => {
    const portalNode = shadowRoot.host
    if (state.theme === 'dark') {
      portalNode.classList.add('dark')
      portalNode.classList.remove('light')
    } else if (state.theme === 'light') {
      portalNode.classList.add('light')
      portalNode.classList.remove('dark')
    } else {
      portalNode.classList.remove('dark')
      portalNode.classList.remove('light')
    }
  }, [shadowRoot, state.theme])

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
      <DevOverlayContext
        value={{
          dispatch,
          getSquashedHydrationErrorDetails,
          shadowRoot,
          state,
        }}
      >
        <DevOverlay />
      </DevOverlayContext>
    </>
  )
}
export const DevOverlayContext = createContext<{
  shadowRoot: ShadowRoot
  state: OverlayState & {
    routerType: 'pages' | 'app'
  }
  dispatch: ActionDispatch<[action: DispatcherEvent]>
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
}>(null!)
export const useDevOverlayContext = () => useContext(DevOverlayContext)

let isPagesMounted = false
let isAppMounted = false

function getSquashedHydrationErrorDetailsApp() {
  // We don't squash hydration errors in the App Router.
  return null
}

export function renderAppDevOverlay(
  getOwnerStack: (error: Error) => string | null | undefined,
  isRecoverableError: (error: Error) => boolean,
  enableCacheIndicator: boolean
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
      // We don't have design for a default Transition indicator for the NDT frontend.
      // So we disable React's built-in one to not conflict with the one for the actual Next.js app.
      onDefaultTransitionIndicator: () => () => {},
    })

    const shadowRoot = container.attachShadow({ mode: 'open' })

    startTransition(() => {
      // TODO: Dedicated error boundary or root error callbacks?
      // At least it won't unmount any user code if it errors.
      root.render(
        <DevOverlayRoot
          enableCacheIndicator={enableCacheIndicator}
          getOwnerStack={getOwnerStack}
          getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetailsApp}
          isRecoverableError={isRecoverableError}
          routerType="app"
          shadowRoot={shadowRoot}
        />
      )
    })

    isAppMounted = true
  }
}

export function renderPagesDevOverlay(
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

    const root = createRoot(container, { identifierPrefix: 'ndt-' })

    const shadowRoot = container.attachShadow({ mode: 'open' })

    startTransition(() => {
      // TODO: Dedicated error boundary or root error callbacks?
      // At least it won't unmount any user code if it errors.
      root.render(
        <DevOverlayRoot
          // Pages Router does not support Cache Components
          enableCacheIndicator={false}
          getOwnerStack={getOwnerStack}
          getSquashedHydrationErrorDetails={getSquashedHydrationErrorDetails}
          isRecoverableError={isRecoverableError}
          routerType="pages"
          shadowRoot={shadowRoot}
        />
      )
    })

    isPagesMounted = true
  }
}
