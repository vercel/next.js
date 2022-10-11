import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { SupportedErrorEvent } from './container/Errors'

export const ACTION_BUILD_OK = 'build-ok'
export const ACTION_BUILD_ERROR = 'build-error'
export const ACTION_REFRESH = 'fast-refresh'
export const ACTION_UNHANDLED_ERROR = 'unhandled-error'
export const ACTION_UNHANDLED_REJECTION = 'unhandled-rejection'

type BuildOkAction = { type: typeof ACTION_BUILD_OK }
type BuildErrorAction = {
  type: typeof ACTION_BUILD_ERROR
  message: string
}
type FastRefreshAction = { type: typeof ACTION_REFRESH }
export type UnhandledErrorAction = {
  type: typeof ACTION_UNHANDLED_ERROR
  reason: Error
  frames: StackFrame[]
}
export type UnhandledRejectionAction = {
  type: typeof ACTION_UNHANDLED_REJECTION
  reason: Error
  frames: StackFrame[]
}

export interface OverlayState {
  nextId: number
  buildError: string | null
  errors: SupportedErrorEvent[]
}

export function errorOverlayReducer(
  state: Readonly<OverlayState>,
  ev: Readonly<
    | BuildOkAction
    | BuildErrorAction
    | FastRefreshAction
    | UnhandledErrorAction
    | UnhandledRejectionAction
  >
): OverlayState {
  switch (ev.type) {
    case ACTION_BUILD_OK: {
      return { ...state, buildError: null }
    }
    case ACTION_BUILD_ERROR: {
      return { ...state, buildError: ev.message }
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
            return err.event.reason !== ev.reason
          }),
          { id: state.nextId, event: ev },
        ],
      }
    }
    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _: never = ev
      return state
    }
  }
}
