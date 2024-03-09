import type {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { NEXT_RSC_UNION_QUERY } from '../../app-router-headers'
import { PromiseQueue } from '../../promise-queue'
import {
  getOrCreatePrefetchCacheEntry,
  prunePrefetchCache,
} from '../prefetch-cache-utils'

export const prefetchQueue = new PromiseQueue(5)

export function prefetchReducer(
  state: ReadonlyReducerState,
  action: PrefetchAction
): ReducerState {
  // let's prune the prefetch cache before we do anything else
  prunePrefetchCache(state.prefetchCache)

  const { url } = action
  url.searchParams.delete(NEXT_RSC_UNION_QUERY)

  getOrCreatePrefetchCacheEntry({
    url,
    nextUrl: state.nextUrl,
    prefetchCache: state.prefetchCache,
    kind: action.kind,
    tree: state.tree,
    buildId: state.buildId,
  })

  return state
}
