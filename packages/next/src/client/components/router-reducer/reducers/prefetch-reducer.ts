import type {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { PromiseQueue } from '../../promise-queue'
import {
  getOrCreatePrefetchCacheEntry,
  prunePrefetchCache,
} from '../prefetch-cache-utils'

export const prefetchQueue = new PromiseQueue(5)

export const prefetchReducer = process.env.__NEXT_CLIENT_SEGMENT_CACHE
  ? identityReducerWhenSegmentCacheIsEnabled
  : prefetchReducerImpl

function identityReducerWhenSegmentCacheIsEnabled<T>(state: T): T {
  // Unlike the old implementation, the Segment Cache doesn't store its data in
  // the router reducer state.
  //
  // This shouldn't be reachable because we wrap the prefetch API in a check,
  // too, which prevents the action from being dispatched. But it's here for
  // clarity + code elimination.
  return state
}

function prefetchReducerImpl(
  state: ReadonlyReducerState,
  action: PrefetchAction
): ReducerState {
  // let's prune the prefetch cache before we do anything else
  prunePrefetchCache(state.prefetchCache)

  const { url } = action

  getOrCreatePrefetchCacheEntry({
    url,
    nextUrl: state.nextUrl,
    prefetchCache: state.prefetchCache,
    kind: action.kind,
    tree: state.tree,
    allowAliasing: true,
  })

  return state
}
