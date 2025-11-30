import {
  ACTION_NAVIGATE,
  ACTION_SERVER_PATCH,
  ACTION_RESTORE,
  ACTION_REFRESH,
  ACTION_HMR_REFRESH,
  ACTION_SERVER_ACTION,
} from './router-reducer-types'
import type {
  ReducerActions,
  ReducerState,
  ReadonlyReducerState,
} from './router-reducer-types'
import { navigateReducer } from './reducers/navigate-reducer'
import { serverPatchReducer } from './reducers/server-patch-reducer'
import { restoreReducer } from './reducers/restore-reducer'
import { refreshReducer } from './reducers/refresh-reducer'
import { hmrRefreshReducer } from './reducers/hmr-refresh-reducer'
import { serverActionReducer } from './reducers/server-action-reducer'

/**
 * Reducer that handles the app-router state updates.
 */
function clientReducer(
  state: ReadonlyReducerState,
  action: ReducerActions
): ReducerState {
  switch (action.type) {
    case ACTION_NAVIGATE: {
      return navigateReducer(state, action)
    }
    case ACTION_SERVER_PATCH: {
      return serverPatchReducer(state, action)
    }
    case ACTION_RESTORE: {
      return restoreReducer(state, action)
    }
    case ACTION_REFRESH: {
      return refreshReducer(state, action)
    }
    case ACTION_HMR_REFRESH: {
      return hmrRefreshReducer(state, action)
    }
    case ACTION_SERVER_ACTION: {
      return serverActionReducer(state, action)
    }
    // This case should never be hit as dispatch is strongly typed.
    default:
      throw new Error('Unknown action')
  }
}

function serverReducer(
  state: ReadonlyReducerState,
  _action: ReducerActions
): ReducerState {
  return state
}

// we don't run the client reducer on the server, so we use a noop function for better tree shaking
export const reducer =
  typeof window === 'undefined' ? serverReducer : clientReducer
