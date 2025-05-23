import { useReducer } from 'react'

import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { VersionInfo } from '../../../server/dev/parse-version-info'
import type { SupportedErrorEvent } from './ui/container/runtime-error/render-error'
import type { ComponentStackFrame } from './utils/parse-component-stack'
import type { DebugInfo } from './types'
import type { DevToolsServerState } from '../../../server/dev/dev-tools-server-state'
import type { HMR_ACTION_TYPES } from '../../../server/dev/hot-reloader-types'
import { getOwnerStack } from '../errors/stitched-error'

type FastRefreshState =
  /** No refresh in progress. */
  | { type: 'idle' }
  /** The refresh process has been triggered, but the new code has not been executed yet. */
  | { type: 'pending'; errors: SupportedErrorEvent[] }

export type DevToolsClientState = {
  versionInfo: VersionInfo
  debugInfo: DebugInfo
  devIndicator: {
    staticIndicator: boolean
    showIndicator: boolean
    disableDevIndicator: boolean
  }
}

export interface OverlayState {
  nextId: number
  buildError: string | null
  errors: SupportedErrorEvent[]
  refreshState: FastRefreshState
  notFound: boolean
  devToolsClientState: DevToolsClientState
  routerType: 'pages' | 'app'
}

export const ACTION_STATIC_INDICATOR = 'static-indicator'
export const ACTION_BUILD_OK = 'build-ok'
export const ACTION_BUILD_ERROR = 'build-error'
export const ACTION_BEFORE_REFRESH = 'before-fast-refresh'
export const ACTION_REFRESH = 'fast-refresh'
export const ACTION_UNHANDLED_ERROR = 'unhandled-error'
export const ACTION_UNHANDLED_REJECTION = 'unhandled-rejection'
export const ACTION_DEV_TOOLS = 'dev-tools'

export const STORAGE_KEY_THEME = '__nextjs-dev-tools-theme'
export const STORAGE_KEY_POSITION = '__nextjs-dev-tools-position'
export const STORAGE_KEY_SCALE = '__nextjs-dev-tools-scale'

interface StaticIndicatorAction {
  type: typeof ACTION_STATIC_INDICATOR
  staticIndicator: boolean
}

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
}
export interface UnhandledRejectionAction {
  type: typeof ACTION_UNHANDLED_REJECTION
  reason: Error
  frames: StackFrame[]
}

interface DevToolsAction {
  type: typeof ACTION_DEV_TOOLS
  devTools: DevToolsServerState
}

export type BusEvent =
  | BuildOkAction
  | BuildErrorAction
  | BeforeFastRefreshAction
  | FastRefreshAction
  | UnhandledErrorAction
  | UnhandledRejectionAction
  | StaticIndicatorAction
  | DevToolsAction

const REACT_ERROR_STACK_BOTTOM_FRAME_REGEX =
  // 1st group: v8
  // 2nd group: SpiderMonkey, JavaScriptCore
  /\s+(at react-stack-bottom-frame.*)|(react-stack-bottom-frame@.*)/

// React calls user code starting from a special stack frame.
// The basic stack will be different if the same error location is hit again
// due to StrictMode.
// This gets only the stack after React which is unaffected by StrictMode.
function getStackIgnoringStrictMode(stack: string | undefined) {
  return stack?.split(REACT_ERROR_STACK_BOTTOM_FRAME_REGEX)[0]
}

function pushErrorFilterDuplicates(
  errors: SupportedErrorEvent[],
  err: SupportedErrorEvent
): SupportedErrorEvent[] {
  const pendingErrors = errors.filter((e) => {
    // Filter out duplicate errors
    return (
      (e.event.reason.stack !== err.event.reason.stack &&
        // TODO: Let ReactDevTools control deduping instead?
        getStackIgnoringStrictMode(e.event.reason.stack) !==
          getStackIgnoringStrictMode(err.event.reason.stack)) ||
      getOwnerStack(e.event.reason) !== getOwnerStack(err.event.reason)
    )
  })
  pendingErrors.push(err)
  return pendingErrors
}

const shouldDisableDevIndicator =
  process.env.__NEXT_DEV_INDICATOR?.toString() === 'false'

export const INITIAL_OVERLAY_STATE: Omit<OverlayState, 'routerType'> = {
  nextId: 1,
  buildError: null,
  errors: [],
  notFound: false,
  refreshState: { type: 'idle' },
  devToolsClientState: {
    versionInfo: { installed: '0.0.0', staleness: 'unknown' },
    debugInfo: { devtoolsFrontendUrl: undefined },
    devIndicator: {
      staticIndicator: false,
      disableDevIndicator: false,
      /* 
    This is set to `true` when we can reliably know
    whether the indicator is in disabled state or not.  
    Otherwise the surface would flicker because the disabled flag loads from the config.
  */
      showIndicator: false,
    },
  },
}

function getInitialState(
  routerType: 'pages' | 'app'
): OverlayState & { routerType: 'pages' | 'app' } {
  return {
    ...INITIAL_OVERLAY_STATE,
    routerType,
  }
}

export function useErrorOverlayReducer(routerType: 'pages' | 'app') {
  return useReducer((state: OverlayState, action: BusEvent): OverlayState => {
    switch (action.type) {
      case ACTION_STATIC_INDICATOR: {
        return {
          ...state,
          devToolsClientState: {
            ...state.devToolsClientState,
            devIndicator: {
              ...state.devToolsClientState.devIndicator,
              staticIndicator: action.staticIndicator,
            },
          },
        }
      }
      case ACTION_BUILD_OK: {
        return { ...state, buildError: null }
      }
      case ACTION_BUILD_ERROR: {
        return { ...state, buildError: action.message }
      }
      case ACTION_BEFORE_REFRESH: {
        return { ...state, refreshState: { type: 'pending', errors: [] } }
      }
      case ACTION_REFRESH: {
        return {
          ...state,
          buildError: null,
          errors:
            // Errors can come in during updates. In this case, UNHANDLED_ERROR
            // and UNHANDLED_REJECTION events might be dispatched between the
            // BEFORE_REFRESH and the REFRESH event. We want to keep those errors
            // around until the next refresh. Otherwise we run into a race
            // condition where those errors would be cleared on refresh completion
            // before they can be displayed.
            state.refreshState.type === 'pending'
              ? state.refreshState.errors
              : [],
          refreshState: { type: 'idle' },
        }
      }
      case ACTION_UNHANDLED_ERROR:
      case ACTION_UNHANDLED_REJECTION: {
        switch (state.refreshState.type) {
          case 'idle': {
            return {
              ...state,
              nextId: state.nextId + 1,
              errors: pushErrorFilterDuplicates(state.errors, {
                id: state.nextId,
                event: action,
              }),
            }
          }
          case 'pending': {
            return {
              ...state,
              nextId: state.nextId + 1,
              refreshState: {
                ...state.refreshState,
                errors: pushErrorFilterDuplicates(state.refreshState.errors, {
                  id: state.nextId,
                  event: action,
                }),
              },
            }
          }
          default:
            return state
        }
      }
      case ACTION_DEV_TOOLS: {
        return {
          ...state,
          devToolsClientState: {
            ...state.devToolsClientState,
            devIndicator: {
              ...state.devToolsClientState.devIndicator,
              showIndicator: true,
              disableDevIndicator:
                shouldDisableDevIndicator ||
                !!action.devTools.devIndicator.disabledUntil,
            },
          },
        }
      }
      default: {
        return state
      }
    }
  }, getInitialState(routerType))
}

export const REACT_REFRESH_FULL_RELOAD =
  '[Fast Refresh] performing full reload\n\n' +
  "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" +
  'You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n' +
  'Consider migrating the non-React component export to a separate file and importing it into both files.\n\n' +
  'It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n' +
  'Fast Refresh requires at least one parent function component in your React tree.'

export const REACT_REFRESH_FULL_RELOAD_FROM_ERROR =
  '[Fast Refresh] performing full reload because your application had an unrecoverable error'

export function reportInvalidHmrMessage(
  message: HMR_ACTION_TYPES | MessageEvent<unknown>,
  err: unknown
) {
  console.warn(
    '[HMR] Invalid message: ' +
      JSON.stringify(message) +
      '\n' +
      ((err instanceof Error && err?.stack) || '')
  )
}
