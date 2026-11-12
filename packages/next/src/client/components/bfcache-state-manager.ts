import type { RouteTree } from './segment-cache/cache'
import type {
  CacheNode,
  FlightRouterState,
} from '../../shared/lib/app-router-types'
import type { Params } from '../../server/request/params'
import type {
  InstrumentedPromise,
  NavigationPromises,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import { useState } from 'react'

// When the flag is disabled, only track the currently active tree
const MAX_BF_CACHE_ENTRIES = process.env.__NEXT_CACHE_COMPONENTS ? 3 : 1

/**
 * The values that `useParams()`, `usePathname()` and `useSearchParams()` read
 * in the subtree of a bfcache entry.
 *
 * The active entry gets the router's current values. An inactive entry keeps
 * the values it had when it was last active. Inactive trees then see the
 * navigation state of their own route, not the active one, and don't re-render
 * when the active route changes.
 *
 * An entry that becomes active again gets the router's current values. They
 * can differ from the ones it was hidden with, because an entry is identified
 * by its own segment only, not by the search params or the segments below it:
 * after `/a`, `/b`, `/a?x=1`, the entry for `a` is shown again with new search
 * params. Its tree then re-renders, with its state preserved. If the values
 * are equal, the entry keeps the same objects and its tree doesn't re-render.
 */
export type RouterNavigationState = {
  params: Params | null
  pathname: string | null
  searchParams: URLSearchParams | null
  // Dev only. The Suspense DevTools promises the same hooks read in dev.
  navigationPromises: NavigationPromises | null
}

export type RouterBFCacheEntry = {
  tree: FlightRouterState
  renderTree: RouteTree<CacheNode>
  stateKey: string
  navigationState: RouterNavigationState | null
  // The entries form a linked list, sorted in order of most recently active.
  next: RouterBFCacheEntry | null
}

/**
 * Keeps track of the most recent N trees (FlightRouterStates) that were active
 * at a certain segment level. E.g. for a segment "/a/b/[param]", this hook
 * tracks the last N param values that the router rendered for N.
 *
 * The result of this hook precisely determines the number and order of
 * trees that are rendered in parallel at their segment level.
 *
 * The purpose of this cache is to we can preserve the React and DOM state of
 * some number of inactive trees, by rendering them in an <Activity> boundary.
 * That means it would not make sense for the the lifetime of the cache to be
 * any longer than the lifetime of the React tree; e.g. if the hook were
 * unmounted, then the React tree would be, too. So, we use React state to
 * manage it.
 *
 * Each entry retains its render tree, including its RSC data. This hook
 * determines which trees should have their React and DOM state preserved
 * by <Activity>.
 */
export function useRouterBFCache(
  activeTree: FlightRouterState,
  activeRenderTree: RouteTree<CacheNode>,
  activeStateKey: string,
  activeNavigationState: RouterNavigationState | null
): RouterBFCacheEntry {
  // The currently active entry. The entries form a linked list, sorted in
  // order of most recently active. This allows us to reuse parts of the list
  // without cloning, unless there's a reordering or removal.
  // TODO: Once we start tracking back/forward history at each route level,
  // we should use the history order instead. In other words, when traversing
  // to an existing entry as a result of a popstate event, we should maintain
  // the existing order instead of moving it to the front of the list. I think
  // an initial implementation of this could be to pass an incrementing id
  // to history.pushState/replaceState, then use that here for ordering.
  const [prevActiveEntry, setPrevActiveEntry] = useState<RouterBFCacheEntry>(
    () => {
      const initialEntry: RouterBFCacheEntry = {
        tree: activeTree,
        renderTree: activeRenderTree,
        stateKey: activeStateKey,
        navigationState: activeNavigationState,
        next: null,
      }
      return initialEntry
    }
  )

  if (
    prevActiveEntry.tree === activeTree &&
    isNavigationStateEqual(
      prevActiveEntry.navigationState,
      activeNavigationState
    )
  ) {
    // Fast path. The active tree and its navigation state haven't changed, so
    // we can reuse the existing state.
    return prevActiveEntry
  }

  // The route tree changed. Note that this doesn't mean that the tree changed
  // *at this level* — the change may be due to a child route. Either way, we
  // need to either add or update the router tree in the bfcache.
  //
  // The rest of the code looks more complicated than it actually is because we
  // can't mutate the state in place; we have to copy-on-write.

  // Create a new entry for the active cache key. This is the head of the new
  // linked list.
  const newActiveEntry: RouterBFCacheEntry = {
    tree: activeTree,
    renderTree: activeRenderTree,
    stateKey: activeStateKey,
    navigationState: activeNavigationState,
    next: null,
  }

  // We need to append the old list onto the new list. If the head of the new
  // list was already present in the cache, then we'll need to clone everything
  // that came before it. Then we can reuse the rest.
  let n = 1
  let oldEntry: RouterBFCacheEntry | null = prevActiveEntry
  let clonedEntry: RouterBFCacheEntry = newActiveEntry
  while (oldEntry !== null && n < MAX_BF_CACHE_ENTRIES) {
    if (oldEntry.stateKey === activeStateKey) {
      // Fast path. This entry in the old list that corresponds to the key that
      // is now active. We've already placed a clone of this entry at the front
      // of the new list. We can reuse the rest of the old list without cloning.
      // NOTE: We don't need to worry about eviction in this case because we
      // haven't increased the size of the cache, and we assume the max size
      // is constant across renders. If we were to change it to a dynamic limit,
      // then the implementation would need to account for that.
      if (
        isNavigationStateEqual(oldEntry.navigationState, activeNavigationState)
      ) {
        // Navigating back to this entry with the values it was hidden with.
        // Keep the same objects so its subtree doesn't re-render.
        newActiveEntry.navigationState = oldEntry.navigationState
      }
      clonedEntry.next = oldEntry.next
      break
    } else {
      // Clone the entry and append it to the list.
      n++
      const entry: RouterBFCacheEntry = {
        tree: oldEntry.tree,
        renderTree: oldEntry.renderTree,
        stateKey: oldEntry.stateKey,
        navigationState: oldEntry.navigationState,
        next: null,
      }
      clonedEntry.next = entry
      clonedEntry = entry
    }
    oldEntry = oldEntry.next
  }

  setPrevActiveEntry(newActiveEntry)
  return newActiveEntry
}

function isNavigationStateEqual(
  a: RouterNavigationState | null,
  b: RouterNavigationState | null
): boolean {
  if (a === b) {
    return true
  }
  if (a === null || b === null) {
    return false
  }
  if (
    a.pathname !== b.pathname ||
    !areParamsEqual(a.params, b.params) ||
    !areSearchParamsEqual(a.searchParams, b.searchParams)
  ) {
    return false
  }
  if (process.env.NODE_ENV !== 'production') {
    return areNavigationPromisesEqual(
      a.navigationPromises,
      b.navigationPromises
    )
  }
  return true
}

function areParamsEqual(a: Params | null, b: Params | null): boolean {
  if (a === b) {
    return true
  }
  if (a === null || b === null) {
    return false
  }
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) {
    return false
  }
  for (const key of aKeys) {
    if (!(key in b) || !areValuesEqual(a[key], b[key])) {
      return false
    }
  }
  return true
}

function areSearchParamsEqual(
  a: URLSearchParams | null,
  b: URLSearchParams | null
): boolean {
  if (a === b) {
    return true
  }
  if (a === null || b === null) {
    return false
  }
  return a.toString() === b.toString()
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => value === b[i])
  }
  return false
}

function areNavigationPromisesEqual(
  a: NavigationPromises | null,
  b: NavigationPromises | null
): boolean {
  if (a === b) {
    return true
  }
  if (a === null || b === null) {
    return false
  }
  return (
    a.pathname.value === b.pathname.value &&
    areParamsEqual(a.params.value, b.params.value) &&
    a.searchParams.value.toString() === b.searchParams.value.toString() &&
    arePromiseMapsEqual(
      a.selectedLayoutSegmentPromises,
      b.selectedLayoutSegmentPromises
    ) &&
    arePromiseMapsEqual(
      a.selectedLayoutSegmentsPromises,
      b.selectedLayoutSegmentsPromises
    )
  )
}

function arePromiseMapsEqual(
  a: Map<string, InstrumentedPromise<unknown>> | undefined,
  b: Map<string, InstrumentedPromise<unknown>> | undefined
): boolean {
  if (a === b) {
    return true
  }
  if (a === undefined || b === undefined || a.size !== b.size) {
    return false
  }
  for (const [key, promise] of a) {
    const other = b.get(key)
    if (other === undefined || !areValuesEqual(promise.value, other.value)) {
      return false
    }
  }
  return true
}
