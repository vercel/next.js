import { useReducer } from 'react'

import type { VersionInfo } from '../../server/dev/parse-version-info'
import type { SupportedErrorEvent } from './container/runtime-error/render-error'
import { parseComponentStack } from './utils/parse-component-stack'
import type { DebugInfo } from '../shared/types'
import type { DevIndicatorServerState } from '../../server/dev/dev-indicator-server-state'
import { parseStack } from '../../server/lib/parse-stack'
import { isConsoleError } from '../shared/console-error'

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
  versionInfo: VersionInfo
  notFound: boolean
  buildingIndicator: boolean
  renderingIndicator: boolean
  staticIndicator: boolean
  showIndicator: boolean
  disableDevIndicator: boolean
  debugInfo: DebugInfo
  routerType: 'pages' | 'app'
  isErrorOverlayOpen: boolean
}
export type OverlayDispatch = React.Dispatch<DispatcherEvent>

export const ACTION_STATIC_INDICATOR = 'static-indicator'
export const ACTION_BUILD_OK = 'build-ok'
export const ACTION_BUILD_ERROR = 'build-error'
export const ACTION_BEFORE_REFRESH = 'before-fast-refresh'
export const ACTION_REFRESH = 'fast-refresh'
export const ACTION_VERSION_INFO = 'version-info'
export const ACTION_UNHANDLED_ERROR = 'unhandled-error'
export const ACTION_UNHANDLED_REJECTION = 'unhandled-rejection'
export const ACTION_DEBUG_INFO = 'debug-info'
export const ACTION_DEV_INDICATOR = 'dev-indicator'
export const ACTION_ERROR_OVERLAY_OPEN = 'error-overlay-open'
export const ACTION_ERROR_OVERLAY_CLOSE = 'error-overlay-close'
export const ACTION_ERROR_OVERLAY_TOGGLE = 'error-overlay-toggle'
export const ACTION_BUILDING_INDICATOR_SHOW = 'building-indicator-show'
export const ACTION_BUILDING_INDICATOR_HIDE = 'building-indicator-hide'
export const ACTION_RENDERING_INDICATOR_SHOW = 'rendering-indicator-show'
export const ACTION_RENDERING_INDICATOR_HIDE = 'rendering-indicator-hide'

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
}
export interface UnhandledRejectionAction {
  type: typeof ACTION_UNHANDLED_REJECTION
  reason: Error
}

export interface DebugInfoAction {
  type: typeof ACTION_DEBUG_INFO
  debugInfo: any
}

interface VersionInfoAction {
  type: typeof ACTION_VERSION_INFO
  versionInfo: VersionInfo
}

interface DevIndicatorAction {
  type: typeof ACTION_DEV_INDICATOR
  devIndicator: DevIndicatorServerState
}

export interface ErrorOverlayOpenAction {
  type: typeof ACTION_ERROR_OVERLAY_OPEN
}
export interface ErrorOverlayCloseAction {
  type: typeof ACTION_ERROR_OVERLAY_CLOSE
}
export interface ErrorOverlayToggleAction {
  type: typeof ACTION_ERROR_OVERLAY_TOGGLE
}

export interface BuildingIndicatorShowAction {
  type: typeof ACTION_BUILDING_INDICATOR_SHOW
}
export interface BuildingIndicatorHideAction {
  type: typeof ACTION_BUILDING_INDICATOR_HIDE
}

export interface RenderingIndicatorShowAction {
  type: typeof ACTION_RENDERING_INDICATOR_SHOW
}
export interface RenderingIndicatorHideAction {
  type: typeof ACTION_RENDERING_INDICATOR_HIDE
}

export type DispatcherEvent =
  | BuildOkAction
  | BuildErrorAction
  | BeforeFastRefreshAction
  | FastRefreshAction
  | UnhandledErrorAction
  | UnhandledRejectionAction
  | VersionInfoAction
  | StaticIndicatorAction
  | DebugInfoAction
  | DevIndicatorAction
  | ErrorOverlayOpenAction
  | ErrorOverlayCloseAction
  | ErrorOverlayToggleAction
  | BuildingIndicatorShowAction
  | BuildingIndicatorHideAction
  | RenderingIndicatorShowAction
  | RenderingIndicatorHideAction

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

const shouldDisableDevIndicator =
  process.env.__NEXT_DEV_INDICATOR?.toString() === 'false'

export const INITIAL_OVERLAY_STATE: Omit<
  OverlayState,
  'isErrorOverlayOpen' | 'routerType'
> = {
  nextId: 1,
  buildError: null,
  errors: [],
  notFound: false,
  renderingIndicator: false,
  staticIndicator: false,
  /* 
    This is set to `true` when we can reliably know
    whether the indicator is in disabled state or not.  
    Otherwise the surface would flicker because the disabled flag loads from the config.
  */
  showIndicator: false,
  disableDevIndicator: false,
  buildingIndicator: false,
  refreshState: { type: 'idle' },
  versionInfo: { installed: '0.0.0', staleness: 'unknown' },
  debugInfo: { devtoolsFrontendUrl: undefined },
}

function getInitialState(
  routerType: 'pages' | 'app'
): OverlayState & { routerType: 'pages' | 'app' } {
  return {
    ...INITIAL_OVERLAY_STATE,
    // Pages Router only listenes to thrown errors which
    // always open the overlay.
    // TODO: Should be the same default as App Router once we surface console.error in Pages Router.
    isErrorOverlayOpen: routerType === 'pages',
    routerType,
  }
}

export function useErrorOverlayReducer(
  routerType: 'pages' | 'app',
  getComponentStack: (error: Error) => string | undefined,
  getOwnerStack: (error: Error) => string | null | undefined,
  isRecoverableError: (error: Error) => boolean
) {
  function pushErrorFilterDuplicates(
    events: SupportedErrorEvent[],
    id: number,
    error: Error
  ): SupportedErrorEvent[] {
    const componentStack = getComponentStack(error)
    const componentStackFrames =
      componentStack === undefined
        ? undefined
        : parseComponentStack(componentStack)
    const ownerStack = getOwnerStack(error)
    const frames = parseStack((error.stack || '') + (ownerStack || ''))
    const pendingEvent: SupportedErrorEvent = {
      id,
      error,
      frames,
      componentStackFrames,
      type: isRecoverableError(error)
        ? 'recoverable'
        : isConsoleError(error)
          ? 'console'
          : 'runtime',
    }
    const pendingEvents = events.filter((event) => {
      // Filter out duplicate errors
      return (
        (event.error.stack !== pendingEvent.error.stack &&
          // TODO: Let ReactDevTools control deduping instead?
          getStackIgnoringStrictMode(event.error.stack) !==
            getStackIgnoringStrictMode(pendingEvent.error.stack)) ||
        getOwnerStack(event.error) !== getOwnerStack(pendingEvent.error)
      )
    })
    // If there's nothing filtered out, the event is a brand new error
    if (pendingEvents.length === events.length) {
      pendingEvents.push(pendingEvent)
      return pendingEvents
    }
    // Otherwise remain the same events
    return events
  }

  return useReducer(
    (state: OverlayState, action: DispatcherEvent): OverlayState => {
      switch (action.type) {
        case ACTION_DEBUG_INFO: {
          return { ...state, debugInfo: action.debugInfo }
        }
        case ACTION_STATIC_INDICATOR: {
          return { ...state, staticIndicator: action.staticIndicator }
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
                errors: pushErrorFilterDuplicates(
                  state.errors,
                  state.nextId,
                  action.reason
                ),
              }
            }
            case 'pending': {
              return {
                ...state,
                nextId: state.nextId + 1,
                refreshState: {
                  ...state.refreshState,
                  errors: pushErrorFilterDuplicates(
                    state.errors,
                    state.nextId,
                    action.reason
                  ),
                },
              }
            }
            default:
              return state
          }
        }
        case ACTION_VERSION_INFO: {
          return { ...state, versionInfo: action.versionInfo }
        }
        case ACTION_DEV_INDICATOR: {
          return {
            ...state,
            showIndicator: true,
            disableDevIndicator:
              shouldDisableDevIndicator || !!action.devIndicator.disabledUntil,
          }
        }
        case ACTION_ERROR_OVERLAY_OPEN: {
          return { ...state, isErrorOverlayOpen: true }
        }
        case ACTION_ERROR_OVERLAY_CLOSE: {
          return { ...state, isErrorOverlayOpen: false }
        }
        case ACTION_ERROR_OVERLAY_TOGGLE: {
          return { ...state, isErrorOverlayOpen: !state.isErrorOverlayOpen }
        }
        case ACTION_BUILDING_INDICATOR_SHOW: {
          return { ...state, buildingIndicator: true }
        }
        case ACTION_BUILDING_INDICATOR_HIDE: {
          return { ...state, buildingIndicator: false }
        }
        case ACTION_RENDERING_INDICATOR_SHOW: {
          return { ...state, renderingIndicator: true }
        }
        case ACTION_RENDERING_INDICATOR_HIDE: {
          return { ...state, renderingIndicator: false }
        }
        default: {
          return state
        }
      }
    },
    getInitialState(routerType)
  )
}
