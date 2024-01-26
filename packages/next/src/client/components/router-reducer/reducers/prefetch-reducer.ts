import type {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { PrefetchKind } from '../router-reducer-types'
import { NEXT_RSC_UNION_QUERY } from '../../app-router-headers'
import { PromiseQueue } from '../../promise-queue'
import {
  createPrefetchCacheKey,
  createPrefetchCacheEntry,
  getPrefetchCacheEntry,
  prunePrefetchCache,
} from './prefetch-cache-utils'

export const prefetchQueue = new PromiseQueue(5)

export function prefetchReducer(
  state: ReadonlyReducerState,
  action: PrefetchAction
): ReducerState {
  // let's prune the prefetch cache before we do anything else
  prunePrefetchCache(state.prefetchCache)

  const { url } = action
  url.searchParams.delete(NEXT_RSC_UNION_QUERY)

  const cacheEntry = getPrefetchCacheEntry(url, state)

  if (cacheEntry) {
    /**
     * If the cache entry present was marked as temporary, it means that we prefetched it from the navigate reducer,
     * where we didn't have the prefetch intent. We want to update it to the new, more accurate, kind here.
     */
    if (cacheEntry.kind === PrefetchKind.TEMPORARY) {
      state.prefetchCache.set(cacheEntry.key, {
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

  const prefetchCacheKey = createPrefetchCacheKey(url)
  const newEntry = createPrefetchCacheEntry({
    state,
    url,
    kind: action.kind,
    prefetchCacheKey,
  })

  state.prefetchCache.set(prefetchCacheKey, newEntry)

  return state
}
