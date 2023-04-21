import { createHrefFromUrl } from '../create-href-from-url'
import { fetchServerResponse } from '../fetch-server-response'
import {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { createRecordFromThenable } from '../create-record-from-thenable'

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

  // If the href was already prefetched it is not necessary to prefetch it again
  if (state.prefetchCache.has(href)) {
    return state
  }

  // fetchServerResponse is intentionally not awaited so that it can be unwrapped in the navigate-reducer
  const serverResponse = createRecordFromThenable(
    fetchServerResponse(
      url,
      // initialTree is used when history.state.tree is missing because the history state is set in `useEffect` below, it being missing means this is the hydration case.
      state.tree,
      state.nextUrl,
      true
    )
  )

  // Create new tree based on the flightSegmentPath and router state patch
  state.prefetchCache.set(href, {
    // Create new tree based on the flightSegmentPath and router state patch
    treeAtTimeOfPrefetch: state.tree,
    data: serverResponse,
  })

  return state
}
