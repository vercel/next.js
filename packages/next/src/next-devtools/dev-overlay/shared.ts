import { useReducer } from 'react'

import type { VersionInfo } from '../../server/dev/parse-version-info'
import type { SupportedErrorEvent } from './container/runtime-error/render-error'
import type { DebugInfo } from '../shared/types'
import type { DevIndicatorServerState } from '../../server/dev/dev-indicator-server-state'
import { parseStack } from '../../server/lib/parse-stack'
import { isConsoleError } from '../shared/console-error'
import type { CacheIndicatorState } from './cache-indicator'

export type DevToolsConfig = {
  theme?: 'light' | 'dark' | 'system'
  disableDevIndicator?: boolean
  devToolsPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  devToolsPanelPosition?: Record<
    string,
    'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  >
  devToolsPanelSize?: Record<string, { width: number; height: number }>
  scale?: number
  hideShortcut?: string | null
}

export type Corners = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type DevToolsIndicatorPosition = Corners

const BASE_SIZE = 16

export const NEXT_DEV_TOOLS_SCALE = {
  Small: BASE_SIZE / 14,
  Medium: BASE_SIZE / 16,
  Large: BASE_SIZE / 18,
}

export type DevToolsScale =
  (typeof NEXT_DEV_TOOLS_SCALE)[keyof typeof NEXT_DEV_TOOLS_SCALE]

type FastRefreshState =
  /** No refresh in progress. */
  | { type: 'idle' }
  /** The refresh process has been triggered, but the new code has not been executed yet. */
  | { type: 'pending'; errors: readonly SupportedErrorEvent[] }

export interface OverlayState {
  readonly nextId: number
  readonly buildError: string | null
  readonly errors: readonly SupportedErrorEvent[]
  readonly refreshState: FastRefreshState
  readonly versionInfo: VersionInfo
  readonly notFound: boolean
  readonly buildingIndicator: boolean
  readonly renderingIndicator: boolean
  readonly cacheIndicator: CacheIndicatorState
  readonly staticIndicator: 'pending' | 'static' | 'dynamic' | 'disabled'
  readonly showIndicator: boolean
  readonly disableDevIndicator: boolean
  readonly debugInfo: DebugInfo
  readonly routerType: 'pages' | 'app'
  /** This flag is used to handle the Error Overlay state in the "old" overlay.
   *  In the DevTools panel, this value will used for the "Error Overlay Mode"
   *  which is viewing the "Issues Tab" as a fullscreen.
   */
  readonly isErrorOverlayOpen: boolean
  readonly devToolsPosition: Corners
  readonly devToolsPanelPosition: Readonly<Record<DevtoolsPanelName, Corners>>
  readonly devToolsPanelSize: Readonly<
    Record<DevtoolsPanelName, { width: number; height: number }>
  >
  readonly scale: number
  readonly page: string
  readonly theme: 'light' | 'dark' | 'system'
  readonly hideShortcut: string | null
}
type DevtoolsPanelName = string
export type OverlayDispatch = React.Dispatch<DispatcherEvent>

export const ACTION_CACHE_INDICATOR = 'cache-indicator'
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
export const ACTION_DEV_INDICATOR_SET = 'dev-indicator-disable'

export const ACTION_ERROR_OVERLAY_OPEN = 'error-overlay-open'
export const ACTION_ERROR_OVERLAY_CLOSE = 'error-overlay-close'
export const ACTION_ERROR_OVERLAY_TOGGLE = 'error-overlay-toggle'

export const ACTION_BUILDING_INDICATOR_SHOW = 'building-indicator-show'
export const ACTION_BUILDING_INDICATOR_HIDE = 'building-indicator-hide'
export const ACTION_RENDERING_INDICATOR_SHOW = 'rendering-indicator-show'
export const ACTION_RENDERING_INDICATOR_HIDE = 'rendering-indicator-hide'

export const ACTION_DEVTOOLS_POSITION = 'devtools-position'
export const ACTION_DEVTOOLS_PANEL_POSITION = 'devtools-panel-position'
export const ACTION_DEVTOOLS_SCALE = 'devtools-scale'

export const ACTION_DEVTOOLS_CONFIG = 'devtools-config'

export const STORAGE_KEY_PANEL_POSITION_PREFIX =
  '__nextjs-dev-tools-panel-position'
export const STORE_KEY_PANEL_SIZE_PREFIX = '__nextjs-dev-tools-panel-size'
export const STORE_KEY_SHARED_PANEL_SIZE =
  '__nextjs-dev-tools-shared-panel-size'
export const STORE_KEY_SHARED_PANEL_LOCATION =
  '__nextjs-dev-tools-shared-panel-location'

export const ACTION_DEVTOOL_UPDATE_ROUTE_STATE =
  'segment-explorer-update-route-state'

interface CacheIndicatorAction {
  type: typeof ACTION_CACHE_INDICATOR
  cacheIndicator: CacheIndicatorState
}

interface StaticIndicatorAction {
  type: typeof ACTION_STATIC_INDICATOR
  staticIndicator: 'pending' | 'static' | 'dynamic' | 'disabled'
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

interface UnhandledErrorAction {
  type: typeof ACTION_UNHANDLED_ERROR
  reason: Error
}
interface UnhandledRejectionAction {
  type: typeof ACTION_UNHANDLED_REJECTION
  reason: Error
}

interface DebugInfoAction {
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

interface DevIndicatorSetAction {
  type: typeof ACTION_DEV_INDICATOR_SET
  disabled: boolean
}

interface ErrorOverlayOpenAction {
  type: typeof ACTION_ERROR_OVERLAY_OPEN
}
interface ErrorOverlayCloseAction {
  type: typeof ACTION_ERROR_OVERLAY_CLOSE
}
interface ErrorOverlayToggleAction {
  type: typeof ACTION_ERROR_OVERLAY_TOGGLE
}

interface BuildingIndicatorShowAction {
  type: typeof ACTION_BUILDING_INDICATOR_SHOW
}
interface BuildingIndicatorHideAction {
  type: typeof ACTION_BUILDING_INDICATOR_HIDE
}

interface RenderingIndicatorShowAction {
  type: typeof ACTION_RENDERING_INDICATOR_SHOW
}
interface RenderingIndicatorHideAction {
  type: typeof ACTION_RENDERING_INDICATOR_HIDE
}

interface DevToolsIndicatorPositionAction {
  type: typeof ACTION_DEVTOOLS_POSITION
  devToolsPosition: Corners
}

interface DevToolsPanelPositionAction {
  type: typeof ACTION_DEVTOOLS_PANEL_POSITION
  key: string
  devToolsPanelPosition: Corners
}

interface DevToolsScaleAction {
  type: typeof ACTION_DEVTOOLS_SCALE
  scale: number
}

interface DevToolUpdateRouteStateAction {
  type: typeof ACTION_DEVTOOL_UPDATE_ROUTE_STATE
  page: string
}

interface DevToolsConfigAction {
  type: typeof ACTION_DEVTOOLS_CONFIG
  devToolsConfig: DevToolsConfig
}

export type DispatcherEvent =
  | BuildOkAction
  | BuildErrorAction
  | BeforeFastRefreshAction
  | FastRefreshAction
  | UnhandledErrorAction
  | UnhandledRejectionAction
  | VersionInfoAction
  | CacheIndicatorAction
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
  | DevToolsIndicatorPositionAction
  | DevToolsPanelPositionAction
  | DevToolsScaleAction
  | DevToolUpdateRouteStateAction
  | DevIndicatorSetAction
  | DevToolsConfigAction

const REACT_ERROR_STACK_BOTTOM_FRAME_REGEX =
  // 1st group: new frame + v8
  // 2nd group: new frame + SpiderMonkey, JavaScriptCore
  // 3rd group: old frame + v8
  // 4th group: old frame + SpiderMonkey, JavaScriptCore
  /\s+(at Object\.react_stack_bottom_frame.*)|(react_stack_bottom_frame@.*)|(at react-stack-bottom-frame.*)|(react-stack-bottom-frame@.*)/

// React calls user code starting from a special stack frame.
// The basic stack will be different if the same error location is hit again
// due to StrictMode.
// This gets only the stack after React which is unaffected by StrictMode.
function getStackIgnoringStrictMode(stack: string | undefined) {
  return stack?.split(REACT_ERROR_STACK_BOTTOM_FRAME_REGEX)[0]
}

const shouldDisableDevIndicator =
  process.env.__NEXT_DEV_INDICATOR?.toString() === 'false'

const devToolsInitialPositionFromNextConfig = (process.env
  .__NEXT_DEV_INDICATOR_POSITION ?? 'bottom-left') as Corners

export const INITIAL_OVERLAY_STATE: Omit<
  OverlayState,
  'isErrorOverlayOpen' | 'routerType'
> = {
  nextId: 1,
  buildError: null,
  errors: [],
  notFound: false,
  renderingIndicator: false,
  cacheIndicator: 'disabled',
  staticIndicator: 'disabled',
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
  devToolsPosition: devToolsInitialPositionFromNextConfig,
  devToolsPanelPosition: {
    [STORE_KEY_SHARED_PANEL_LOCATION]: devToolsInitialPositionFromNextConfig,
  },
  devToolsPanelSize: {},
  scale: NEXT_DEV_TOOLS_SCALE.Medium,
  page: '',
  theme: 'system',
  hideShortcut: null,
}

function getInitialState(
  routerType: 'pages' | 'app',
  enableCacheIndicator: boolean
): OverlayState & { routerType: 'pages' | 'app' } {
  return {
    ...INITIAL_OVERLAY_STATE,
    // Pages Router only listenes to thrown errors which
    // always open the overlay.
    // TODO: Should be the same default as App Router once we surface console.error in Pages Router.
    isErrorOverlayOpen: routerType === 'pages',
    routerType,
    cacheIndicator: enableCacheIndicator ? 'ready' : 'disabled',
  }
}

export function useErrorOverlayReducer(
  routerType: 'pages' | 'app',
  getOwnerStack: (error: Error) => string | null | undefined,
  isRecoverableError: (error: Error) => boolean,
  enableCacheIndicator: boolean
) {
  function pushErrorFilterDuplicates(
    events: readonly SupportedErrorEvent[],
    id: number,
    error: Error
  ): readonly SupportedErrorEvent[] {
    const ownerStack = getOwnerStack(error)
    const frames = parseStack((error.stack || '') + (ownerStack || ''))
    const pendingEvent: SupportedErrorEvent = {
      id,
      error,
      frames,
      type: isRecoverableError(error)
        ? 'recoverable'
        : isConsoleError(error)
          ? 'console'
          : 'runtime',
    }
    const pendingEvents = events.filter((event) => {
      // Filter out duplicate errors
      return (
        // SpiderMonkey and JavaScriptCore don't include the error message in the stack.
        // We don't want to dedupe errors with different messages for which we don't have a good stack
        '' + event.error !== '' + pendingEvent.error ||
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
        case ACTION_CACHE_INDICATOR: {
          return { ...state, cacheIndicator: action.cacheIndicator }
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
        case ACTION_DEV_INDICATOR_SET: {
          return { ...state, disableDevIndicator: action.disabled }
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

        case ACTION_DEVTOOLS_POSITION: {
          return { ...state, devToolsPosition: action.devToolsPosition }
        }
        case ACTION_DEVTOOLS_PANEL_POSITION: {
          return {
            ...state,
            devToolsPanelPosition: {
              ...state.devToolsPanelPosition,
              [action.key]: action.devToolsPanelPosition,
            },
          }
        }

        case ACTION_DEVTOOLS_SCALE: {
          return { ...state, scale: action.scale }
        }
        case ACTION_DEVTOOL_UPDATE_ROUTE_STATE: {
          return { ...state, page: action.page }
        }
        case ACTION_DEVTOOLS_CONFIG: {
          const {
            theme,
            disableDevIndicator,
            devToolsPosition,
            devToolsPanelPosition,
            devToolsPanelSize,
            scale,
            hideShortcut,
          } = action.devToolsConfig

          return {
            ...state,
            theme: theme ?? state.theme,
            disableDevIndicator:
              disableDevIndicator ?? state.disableDevIndicator,
            devToolsPosition: devToolsPosition ?? state.devToolsPosition,
            devToolsPanelPosition:
              devToolsPanelPosition ?? state.devToolsPanelPosition,
            scale: scale ?? state.scale,
            devToolsPanelSize: devToolsPanelSize ?? state.devToolsPanelSize,
            hideShortcut:
              // hideShortcut can be null.
              hideShortcut !== undefined ? hideShortcut : state.hideShortcut,
          }
        }
        default: {
          return state
        }
      }
    },
    getInitialState(routerType, enableCacheIndicator)
  )
}
