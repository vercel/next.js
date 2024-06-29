import { useReducer } from 'react'

import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { SupportedErrorEvent } from './internal/container/Errors'
import type { ComponentStackFrame } from './internal/helpers/parse-component-stack'

type FastRefreshState =
  /** No refresh in progress. */
  | { type: 'idle' }
  /** The refresh process has been triggered, but the new code has not been executed yet. */
  | { type: 'pending'; errors: SupportedErrorEvent[] }

export interface OverlayState {
  nextId: number
  buildError: string | null
  errors: SupportedErrorEvent[]
  refreshState: FastRefreshState
  rootLayoutMissingTags: typeof window.__next_root_layout_missing_tags
  nextVersion: string
  notFound: boolean
}

export const ACTION_BUILD_OK = 'build-ok'
export const ACTION_BUILD_ERROR = 'build-error'
export const ACTION_BEFORE_REFRESH = 'before-fast-refresh'
export const ACTION_REFRESH = 'fast-refresh'
export const ACTION_VERSION_INFO = 'version-info'
export const ACTION_UNHANDLED_ERROR = 'unhandled-error'
export const ACTION_UNHANDLED_REJECTION = 'unhandled-rejection'

interface BuildOkAction {
  type: typeof ACTION_BUILD_OK
}
interface BuildErrorAction {
  type: typeof ACTION_BUILD_ERROR
  message: string
}
interface BeforeFastRefreshAction {
  type: typeof ACTION_BEFORE_REFRESH
}
interface FastRefreshAction {
  type: typeof ACTION_REFRESH
}

export interface UnhandledErrorAction {
  type: typeof ACTION_UNHANDLED_ERROR
  reason: Error
  frames: StackFrame[]
  componentStackFrames?: ComponentStackFrame[]
  warning?: [string, string, string]
}
export interface UnhandledRejectionAction {
  type: typeof ACTION_UNHANDLED_REJECTION
  reason: Error
  frames: StackFrame[]
}

interface VersionInfoAction {
  type: typeof ACTION_VERSION_INFO
  nextVersion: string
}

export type BusEvent =
  | BuildOkAction
  | BuildErrorAction
  | BeforeFastRefreshAction
  | FastRefreshAction
  | UnhandledErrorAction
  | UnhandledRejectionAction
  | VersionInfoAction

function pushErrorFilterDuplicates(
  errors: SupportedErrorEvent[],
  err: SupportedErrorEvent
): SupportedErrorEvent[] {
  return [
    ...errors.filter((e) => {
      // Filter out duplicate errors
      return e.event.reason !== err.event.reason
    }),
    err,
  ]
}

export const INITIAL_OVERLAY_STATE: OverlayState = {
  nextId: 1,
  buildError: null,
  errors: [],
  notFound: false,
  refreshState: { type: 'idle' },
  rootLayoutMissingTags: [],
  nextVersion: '0.0.0',
}

export function useErrorOverlayReducer() {
  return useReducer((_state: OverlayState, action: BusEvent): OverlayState => {
    switch (action.type) {
      case ACTION_BUILD_OK: {
        return { ..._state, buildError: null }
      }
      case ACTION_BUILD_ERROR: {
        return { ..._state, buildError: action.message }
      }
      case ACTION_BEFORE_REFRESH: {
        return { ..._state, refreshState: { type: 'pending', errors: [] } }
      }
      case ACTION_REFRESH: {
        return {
          ..._state,
          buildError: null,
          errors:
            // Errors can come in during updates. In this case, UNHANDLED_ERROR
            // and UNHANDLED_REJECTION events might be dispatched between the
            // BEFORE_REFRESH and the REFRESH event. We want to keep those errors
            // around until the next refresh. Otherwise we run into a race
            // condition where those errors would be cleared on refresh completion
            // before they can be displayed.
            _state.refreshState.type === 'pending'
              ? _state.refreshState.errors
              : [],
          refreshState: { type: 'idle' },
        }
      }
      case ACTION_UNHANDLED_ERROR:
      case ACTION_UNHANDLED_REJECTION: {
        switch (_state.refreshState.type) {
          case 'idle': {
            return {
              ..._state,
              nextId: _state.nextId + 1,
              errors: pushErrorFilterDuplicates(_state.errors, {
                id: _state.nextId,
                event: action,
              }),
            }
          }
          case 'pending': {
            return {
              ..._state,
              nextId: _state.nextId + 1,
              refreshState: {
                ..._state.refreshState,
                errors: pushErrorFilterDuplicates(_state.refreshState.errors, {
                  id: _state.nextId,
                  event: action,
                }),
              },
            }
          }
          default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const _: never = _state.refreshState
            return _state
        }
      }
      case ACTION_VERSION_INFO: {
        return { ..._state, nextVersion: action.nextVersion }
      }
      default: {
        return _state
      }
    }
  }, INITIAL_OVERLAY_STATE)
}

export const REACT_REFRESH_FULL_RELOAD_FROM_ERROR =
  '[Fast Refresh] performing full reload because your application had an unrecoverable error'
