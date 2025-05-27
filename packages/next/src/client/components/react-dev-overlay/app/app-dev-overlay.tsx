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
} from '../shared'

import { useInsertionEffect } from 'react'
import { FontStyles } from '../font/font-styles'
import type { DebugInfo } from '../types'
import { DevOverlay } from '../ui/dev-overlay'
import { getComponentStack, getOwnerStack } from '../../errors/stitched-error'
import { isRecoverableError } from '../../../react-client-callbacks/on-recoverable-error'
import type { DevIndicatorServerState } from '../../../../server/dev/dev-indicator-server-state'
import type { VersionInfo } from '../../../../server/dev/parse-version-info'

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

function getSquashedHydrationErrorDetails() {
  // We don't squash hydration errors in the App Router.
  return null
}

export function AppDevOverlay() {
  const [state, dispatch] = useErrorOverlayReducer(
    'app',
    getComponentStack,
    getOwnerStack,
    isRecoverableError
  )

  useInsertionEffect(() => {
    maybeDispatch = dispatch

    replayQueuedEvents(dispatch)

    return () => {
      maybeDispatch = null
    }
  })

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
