import type { DispatcherEvent, OverlayState } from '../shared'

import { useReducer } from 'react'
import {
  ACTION_BEFORE_REFRESH,
  ACTION_BUILD_ERROR,
  ACTION_BUILD_OK,
  ACTION_BUILDING_INDICATOR_HIDE,
  ACTION_BUILDING_INDICATOR_SHOW,
  ACTION_CACHE_INDICATOR,
  ACTION_DEBUG_INFO,
  ACTION_DEV_INDICATOR,
  ACTION_DEV_INDICATOR_SET,
  ACTION_DEVTOOL_UPDATE_ROUTE_STATE,
  ACTION_DEVTOOLS_CONFIG,
  ACTION_DEVTOOLS_PANEL_POSITION,
  ACTION_DEVTOOLS_POSITION,
  ACTION_DEVTOOLS_SCALE,
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
  ACTION_ERROR_OVERLAY_TOGGLE,
  ACTION_REFRESH,
  ACTION_RENDERING_INDICATOR_HIDE,
  ACTION_RENDERING_INDICATOR_SHOW,
  ACTION_STATIC_INDICATOR,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  ACTION_VERSION_INFO,
  INITIAL_OVERLAY_STATE,
} from '../shared'

export const storybookDefaultOverlayState: OverlayState = {
  ...INITIAL_OVERLAY_STATE,
  routerType: 'app',
  isErrorOverlayOpen: false,
  showIndicator: true,
  versionInfo: {
    installed: '15.4.0',
    staleness: 'fresh',
  },
}

export function useStorybookOverlayReducer(initialState?: OverlayState) {
  return useReducer<OverlayState, [DispatcherEvent]>(
    (state, action): OverlayState => {
      switch (action.type) {
        case ACTION_ERROR_OVERLAY_CLOSE: {
          return { ...state, isErrorOverlayOpen: false }
        }
        case ACTION_ERROR_OVERLAY_OPEN: {
          return { ...state, isErrorOverlayOpen: true }
        }
        case ACTION_ERROR_OVERLAY_TOGGLE: {
          return { ...state, isErrorOverlayOpen: !state.isErrorOverlayOpen }
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
        case ACTION_DEV_INDICATOR_SET: {
          return { ...state, showIndicator: !action.disabled }
        }
        case ACTION_BEFORE_REFRESH:
        case ACTION_BUILD_ERROR:
        case ACTION_BUILD_OK:
        case ACTION_BUILDING_INDICATOR_HIDE:
        case ACTION_BUILDING_INDICATOR_SHOW:
        case ACTION_DEBUG_INFO:
        case ACTION_DEV_INDICATOR:
        case ACTION_DEVTOOL_UPDATE_ROUTE_STATE:
        case ACTION_REFRESH:
        case ACTION_RENDERING_INDICATOR_HIDE:
        case ACTION_RENDERING_INDICATOR_SHOW:
        case ACTION_CACHE_INDICATOR:
        case ACTION_STATIC_INDICATOR:
        case ACTION_UNHANDLED_ERROR:
        case ACTION_UNHANDLED_REJECTION:
        case ACTION_VERSION_INFO:
        case ACTION_DEVTOOLS_CONFIG:
          return state
        default: {
          return action satisfies never
        }
      }
    },
    initialState || storybookDefaultOverlayState
  )
}
