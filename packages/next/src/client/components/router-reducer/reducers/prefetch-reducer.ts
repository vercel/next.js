import { fetchServerResponse } from '../fetch-server-response'
import type {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { PrefetchKind } from '../router-reducer-types'
import { prunePrefetchCache } from './prune-prefetch-cache'
import { NEXT_RSC_UNION_QUERY } from '../../app-router-headers'
import { PromiseQueue } from '../../promise-queue'
import { createPrefetchCacheKey } from './create-prefetch-cache-key'

export const prefetchQueue = new PromiseQueue(5)

export function prefetchReducer(
  state: ReadonlyReducerState,
  action: PrefetchAction
): ReducerState {
  // let's prune the prefetch cache before we do anything else
  prunePrefetchCache(state.prefetchCache)

  const { url } = action
  url.searchParams.delete(NEXT_RSC_UNION_QUERY)

  const prefetchCacheKey = createPrefetchCacheKey(url, state.nextUrl)
  const cacheEntry = state.prefetchCache.get(prefetchCacheKey)

  if (cacheEntry) {
    /**
     * If the cache entry present was marked as temporary, it means that we prefetched it from the navigate reducer,
     * where we didn't have the prefetch intent. We want to update it to the new, more accurate, kind here.
     */
    if (cacheEntry.kind === PrefetchKind.TEMPORARY) {
      state.prefetchCache.set(prefetchCacheKey, {
        ...cacheEntry,
        kind: action.kind,
      })
    }

    /**
     * if the prefetch action was a full prefetch and that the current cache entry wasn't one, we want to re-prefetch,
     * otherwise we can re-use the current cache entry
     **/
    if (
      !(
        cacheEntry.kind === PrefetchKind.AUTO &&
        action.kind === PrefetchKind.FULL
      )
    ) {
      return state
    }
  }

  // fetchServerResponse is intentionally not awaited so that it can be unwrapped in the navigate-reducer
  const serverResponse = prefetchQueue.enqueue(() =>
    fetchServerResponse(
      url,
      // initialTree is used when history.state.tree is missing because the history state is set in `useEffect` below, it being missing means this is the hydration case.
      state.tree,
      state.nextUrl,
      state.buildId,
      action.kind
    )
  )

  // Create new tree based on the flightSegmentPath and router state patch
  state.prefetchCache.set(prefetchCacheKey, {
    // Create new tree based on the flightSegmentPath and router state patch
    treeAtTimeOfPrefetch: state.tree,
    data: serverResponse,
    kind: action.kind,
    prefetchTime: Date.now(),
    lastUsedTime: null,
  })

  return state
}
