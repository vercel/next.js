import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { SupportedErrorEvent } from './container/Errors'

export const ACTION_BUILD_OK = 'build-ok'
export const ACTION_BUILD_ERROR = 'build-error'
export const ACTION_REFRESH = 'fast-refresh'
export const ACTION_UNHANDLED_ERROR = 'unhandled-error'
export const ACTION_UNHANDLED_REJECTION = 'unhandled-rejection'

interface BuildOkAction {
  type: typeof ACTION_BUILD_OK
}
interface BuildErrorAction {
  type: typeof ACTION_BUILD_ERROR
  message: string
}
interface FastRefreshAction {
  type: typeof ACTION_REFRESH
}
export interface UnhandledErrorAction {
  type: typeof ACTION_UNHANDLED_ERROR
  reason: Error
  frames: StackFrame[]
}
export interface UnhandledRejectionAction {
  type: typeof ACTION_UNHANDLED_REJECTION
  reason: Error
  frames: StackFrame[]
}

export interface OverlayState {
  nextId: number
  buildError: string | null
  errors: SupportedErrorEvent[]
  rootLayoutMissingTagsError?: {
    missingTags: string[]
  }
}

export function errorOverlayReducer(
  state: Readonly<OverlayState>,
  action: Readonly<
    | BuildOkAction
    | BuildErrorAction
    | FastRefreshAction
    | UnhandledErrorAction
    | UnhandledRejectionAction
  >
): OverlayState {
  switch (action.type) {
    case ACTION_BUILD_OK: {
      return { ...state, buildError: null }
    }
    case ACTION_BUILD_ERROR: {
      return { ...state, buildError: action.message }
    }
    case ACTION_REFRESH: {
      return { ...state, buildError: null, errors: [] }
    }
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      return {
        ...state,
        nextId: state.nextId + 1,
        errors: [
          ...state.errors.filter((err) => {
            // Filter out duplicate errors
            return err.event.reason !== action.reason
          }),
          { id: state.nextId, event: action },
        ],
      }
    }
    default: {
      return state
    }
  }
}
