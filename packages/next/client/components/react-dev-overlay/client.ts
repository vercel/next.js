import { Dispatch, ReducerAction } from 'react'
import type { errorOverlayReducer } from './internal/error-overlay-reducer'
import {
  ACTION_BUILD_OK,
  ACTION_BUILD_ERROR,
  ACTION_REFRESH,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from './internal/error-overlay-reducer'
import { parseStack } from './internal/helpers/parseStack'

export type DispatchFn = Dispatch<ReducerAction<typeof errorOverlayReducer>>

export function onUnhandledError(dispatch: DispatchFn, ev: ErrorEvent) {
  const error = ev?.error
  if (!error || !(error instanceof Error) || typeof error.stack !== 'string') {
    // A non-error was thrown, we don't have anything to show. :-(
    return
  }

  if (
    error.message.match(/(hydration|content does not match|did not match)/i)
  ) {
    error.message += `\n\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error`
  }

  const e = error
  dispatch({
    type: ACTION_UNHANDLED_ERROR,
    reason: error,
    frames: parseStack(e.stack!),
  })
}

export function onUnhandledRejection(
  dispatch: DispatchFn,
  ev: PromiseRejectionEvent
) {
  const reason = ev?.reason
  if (
    !reason ||
    !(reason instanceof Error) ||
    typeof reason.stack !== 'string'
  ) {
    // A non-error was thrown, we don't have anything to show. :-(
    return
  }

  const e = reason
  dispatch({
    type: ACTION_UNHANDLED_REJECTION,
    reason: reason,
    frames: parseStack(e.stack!),
  })
}

export function onBuildOk(dispatch: DispatchFn) {
  dispatch({ type: ACTION_BUILD_OK })
}

export function onBuildError(dispatch: DispatchFn, message: string) {
  dispatch({ type: ACTION_BUILD_ERROR, message })
}

export function onRefresh(dispatch: DispatchFn) {
  dispatch({ type: ACTION_REFRESH })
}

export { getErrorByType } from './internal/helpers/getErrorByType'
export { getServerError } from './internal/helpers/nodeStackFrames'
export { default as ReactDevOverlay } from './internal/ReactDevOverlay'
