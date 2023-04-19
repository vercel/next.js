import { createHrefFromUrl } from '../create-href-from-url'
import { fetchServerResponse } from '../fetch-server-response'
import {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { createRecordFromThenable } from '../create-record-from-thenable'
import {
  PrefetchCacheEntryStatus,
  getPrefetchEntryCacheStatus,
} from '../get-prefetch-cache-entry-status'

export function prefetchReducer(
  state: ReadonlyReducerState,
  action: PrefetchAction
): ReducerState {
  const { url } = action
  const href = createHrefFromUrl(
    url,
    // Ensures the hash is not part of the cache key as it does not affect fetching the server
    false
  )

  const cacheEntry = state.prefetchCache.get(href)

  if (cacheEntry) {
    /**
     * 1 - if the entry is not expired, there's no need to prefetch again
     * 2 - if the prefetch action was a full prefetch and that the current cache entry wasn't one, we want to re-prefetch, otherwise we can re-use the current cache entry
     **/
    if (
      getPrefetchEntryCacheStatus(cacheEntry) !==
        PrefetchCacheEntryStatus.expired ||
      !(cacheEntry.kind === 'auto' && action.kind === 'full')
    ) {
      return state
    }
  }

  // fetchServerResponse is intentionally not awaited so that it can be unwrapped in the navigate-reducer
  const serverResponse = createRecordFromThenable(
    fetchServerResponse(
      url,
      // initialTree is used when history.state.tree is missing because the history state is set in `useEffect` below, it being missing means this is the hydration case.
      state.tree,
      state.nextUrl,
      action.kind
    )
  )

  // Create new tree based on the flightSegmentPath and router state patch
  state.prefetchCache.set(href, {
    // Create new tree based on the flightSegmentPath and router state patch
    treeAtTimeOfPrefetch: state.tree,
    data: serverResponse,
    kind: action.kind,
    prefetchTime: Date.now(),
    lastUsedTime: null,
  })

  return state
}
