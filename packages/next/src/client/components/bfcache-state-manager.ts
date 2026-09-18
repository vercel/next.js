import type {
  CacheNode,
  FlightRouterState,
} from '../../shared/lib/app-router-types'
import { useState } from 'react'

// When the flag is disabled, only track the currently active tree
const MAX_BF_CACHE_ENTRIES = process.env.__NEXT_CACHE_COMPONENTS ? 3 : 1

export type RouterBFCacheEntry = {
  tree: FlightRouterState
  cacheNode: CacheNode
  stateKey: string
  historyId?: number
  // The entries form a linked list.
  next: RouterBFCacheEntry | null
}

type RouterBFCacheState = {
  activeTree: FlightRouterState
  activeHistoryId?: number
  head: RouterBFCacheEntry
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
  activeCacheNode: CacheNode,
  activeStateKey: string,
  activeHistoryId?: number
): RouterBFCacheEntry {
  // The currently active entry and cache list.
  // When traversing to an existing entry as a result of a popstate event,
  // we maintain the existing order instead of moving it to the front of the list,
  // using an incrementing id passed through history.pushState/replaceState.
  const [cacheState, setCacheState] = useState<RouterBFCacheState>(() => {
    const initialEntry: RouterBFCacheEntry = {
      tree: activeTree,
      cacheNode: activeCacheNode,
      stateKey: activeStateKey,
      historyId: activeHistoryId,
      next: null,
    }
    return {
      activeTree,
      activeHistoryId,
      head: initialEntry,
    }
  })

  if (
    cacheState.activeTree === activeTree &&
    cacheState.activeHistoryId === activeHistoryId
  ) {
    // Fast path. The active tree and historyId haven't changed, so we can reuse the
    // existing state.
    return cacheState.head
  }

  // Check if activeHistoryId already exists in the list.
  // When traversing to an existing entry as a result of a popstate event,
  // we maintain the existing order instead of moving it to the front of the list.
  let isExistingHistoryEntry = false
  if (activeHistoryId !== undefined) {
    let curr: RouterBFCacheEntry | null = cacheState.head
    while (curr !== null) {
      if (curr.historyId === activeHistoryId) {
        isExistingHistoryEntry = true
        break
      }
      curr = curr.next
    }
  }

  if (isExistingHistoryEntry) {
    // Maintain the existing order; update the matching entry with latest tree and cacheNode in place.
    let head: RouterBFCacheEntry | null = null
    let tail: RouterBFCacheEntry | null = null
    let oldEntry: RouterBFCacheEntry | null = cacheState.head

    while (oldEntry !== null) {
      const isTarget = oldEntry.historyId === activeHistoryId
      const entry: RouterBFCacheEntry = {
        tree: isTarget ? activeTree : oldEntry.tree,
        cacheNode: isTarget ? activeCacheNode : oldEntry.cacheNode,
        stateKey: isTarget ? activeStateKey : oldEntry.stateKey,
        historyId: oldEntry.historyId,
        next: null,
      }
      if (tail === null) {
        head = entry
        tail = entry
      } else {
        tail.next = entry
        tail = entry
      }
      oldEntry = oldEntry.next
    }

    if (head !== null) {
      setCacheState({
        activeTree,
        activeHistoryId,
        head,
      })
      return head
    }
  }

  // The route tree changed for a new navigation.
  // Create a new entry for the active cache key. This is the head of the new
  // linked list.
  const newActiveEntry: RouterBFCacheEntry = {
    tree: activeTree,
    cacheNode: activeCacheNode,
    stateKey: activeStateKey,
    historyId: activeHistoryId,
    next: null,
  }

  // We need to append the old list onto the new list. If the head of the new
  // list was already present in the cache, then we'll need to clone everything
  // that came before it. Then we can reuse the rest.
  let n = 1
  let oldEntry: RouterBFCacheEntry | null = cacheState.head
  let clonedEntry: RouterBFCacheEntry = newActiveEntry
  while (oldEntry !== null && n < MAX_BF_CACHE_ENTRIES) {
    if (
      oldEntry.stateKey === activeStateKey ||
      (activeHistoryId !== undefined && oldEntry.historyId === activeHistoryId)
    ) {
      // Fast path. This entry in the old list corresponds to the key that
      // is now active. We've already placed a clone of this entry at the front
      // of the new list. We can reuse the rest of the old list without cloning.
      clonedEntry.next = oldEntry.next
      break
    } else {
      // Clone the entry and append it to the list.
      n++
      const entry: RouterBFCacheEntry = {
        tree: oldEntry.tree,
        cacheNode: oldEntry.cacheNode,
        stateKey: oldEntry.stateKey,
        historyId: oldEntry.historyId,
        next: null,
      }
      clonedEntry.next = entry
      clonedEntry = entry
    }
    oldEntry = oldEntry.next
  }

  setCacheState({
    activeTree,
    activeHistoryId,
    head: newActiveEntry,
  })
  return newActiveEntry
}
