import type { FlightRouterState } from '../../shared/lib/app-router-types'
import { useState } from 'react'

// When the flag is disabled, only track the currently active tree
const MAX_BF_CACHE_ENTRIES = process.env.__NEXT_CACHE_COMPONENTS ? 3 : 1

export type RouterBFCacheEntry = {
  tree: FlightRouterState
  stateKey: string
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
 * Note that we don't store the RSC data for the cache entries in this hook —
 * the data for inactive segments is stored in the parent CacheNode, which
 * *does* have a longer lifetime than the React tree. This hook only determines
 * which of those trees should have their *state* preserved, by <Activity>.
 */
export function useRouterBFCache(
  activeTree: FlightRouterState,
  activeStateKey: string
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
        stateKey: activeStateKey,
        next: null,
      }
      return initialEntry
    }
  )

  if (prevActiveEntry.tree === activeTree) {
    // Fast path. The active tree hasn't changed, so we can reuse the
    // existing state.
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
    stateKey: activeStateKey,
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
      clonedEntry.next = oldEntry.next
      break
    } else {
      // Clone the entry and append it to the list.
      n++
      const entry: RouterBFCacheEntry = {
        tree: oldEntry.tree,
        stateKey: oldEntry.stateKey,
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
