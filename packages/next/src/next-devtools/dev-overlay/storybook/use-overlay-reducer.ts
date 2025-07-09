import type { DispatcherEvent, OverlayState } from '../shared'

import { useReducer } from 'react'
import {
  ACTION_DEVTOOLS_POSITION,
  ACTION_DEVTOOLS_PANEL_CLOSE,
  ACTION_DEVTOOLS_PANEL_TOGGLE,
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
  ACTION_ERROR_OVERLAY_TOGGLE,
  ACTION_DEVTOOLS_SCALE,
  INITIAL_OVERLAY_STATE,
  ACTION_DEVTOOLS_PANEL_OPEN,
} from '../shared'

export const storybookDefaultOverlayState: OverlayState = {
  ...INITIAL_OVERLAY_STATE,
  routerType: 'app',
  isErrorOverlayOpen: true,
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
        case ACTION_DEVTOOLS_PANEL_TOGGLE: {
          return { ...state, isDevToolsPanelOpen: !state.isDevToolsPanelOpen }
        }
        case ACTION_DEVTOOLS_PANEL_CLOSE: {
          return { ...state, isDevToolsPanelOpen: false }
        }
        case ACTION_DEVTOOLS_PANEL_OPEN: {
          return { ...state, isDevToolsPanelOpen: true }
        }
        case ACTION_DEVTOOLS_POSITION: {
          return { ...state, devToolsPosition: action.devToolsPosition }
        }
        case ACTION_DEVTOOLS_SCALE: {
          return { ...state, scale: action.scale }
        }
        default: {
          return state
        }
      }
    },
    initialState || storybookDefaultOverlayState
  )
}
