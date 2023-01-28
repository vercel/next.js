import { CacheStates } from '../../../shared/lib/app-router-context'
import type { FlightSegmentPath } from '../../../server/app-render'
import { fetchServerResponse } from './fetch-server-response'
import { createRecordFromThenable } from './create-record-from-thenable'
import { readRecordValue } from './read-record-value'
import { createHrefFromUrl } from './create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'
import { invalidateCacheBelowFlightSegmentPath } from './invalidate-cache-below-flight-segmentpath'
import { fillCacheWithDataProperty } from './fill-cache-with-data-property'
import { createOptimisticTree } from './create-optimistic-tree'
import { applyRouterStatePatchToTree } from './apply-router-state-patch-to-tree'
import { shouldHardNavigate } from './should-hard-navigate'
import { isNavigatingToNewRootLayout } from './is-navigating-to-new-root-layout'
import {
  AppRouterState,
  RefreshAction,
  NavigateAction,
  RestoreAction,
  ServerPatchAction,
  PrefetchAction,
  ACTION_NAVIGATE,
  ACTION_SERVER_PATCH,
  ACTION_RESTORE,
  ACTION_REFRESH,
  ACTION_PREFETCH,
} from './router-reducer-types'

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
    case ACTION_PREFETCH: {
      return prefetchReducer(state, action)
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
