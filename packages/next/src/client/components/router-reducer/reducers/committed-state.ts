import type { FlightRouterState } from '../../../../shared/lib/app-router-types'
import { createHrefFromUrl } from '../create-href-from-url'

// The tree from the last state that was committed to the browser history
// (i.e., the last state for which HistoryUpdater's useInsertionEffect ran).
// This lets the server-patch reducer distinguish between retrying a
// navigation that already pushed a history entry vs one whose transition
// suspended and never committed.
//
// Currently only used by the server-patch retry logic, but this module is a
// stepping stone toward a broader refactor of the navigation queue. The
// existing AppRouter action queue will eventually be replaced by a more
// reactive model that explicitly tracks pending vs committed navigation
// state. This file will likely evolve into (or be subsumed by) that new
// implementation.
let lastCommittedTree: FlightRouterState | null = null

export function getLastCommittedTree(): FlightRouterState | null {
  return lastCommittedTree
}

export function setLastCommittedTree(tree: FlightRouterState): void {
  lastCommittedTree = tree
}

// The href of a history entry pushed optimistically when a push navigation
// starts, or null when no such entry is outstanding. The entry is pushed
// synchronously inside the originating event (e.g. the Link click) so that
// browsers attribute user interaction to it; Safari skips back/forward
// entries whose pushState was not associated with a user gesture, which
// used to happen because the router only pushed after the navigation
// committed. See https://github.com/vercel/next.js/issues/100931
//
// HistoryUpdater reconciles the entry when the navigation commits: it
// attaches the real history state to it, or repurposes it when the committed
// URL differs (e.g. the navigation redirected).
let optimisticHistoryEntryHref: string | null = null

function getCurrentHref(): string {
  return createHrefFromUrl(new URL(window.location.href))
}

/**
 * Push a history entry for a push navigation synchronously, while the
 * originating user gesture is still active. Must only be called for
 * same-origin navigations to a URL whose commit will push (not replace).
 *
 * If a previous navigation's optimistic entry is still the current one —
 * because that navigation redirected into this one, or two navigations
 * started in quick succession — the entry is repurposed instead of stacking
 * another one.
 */
export function pushOptimisticHistoryEntry(href: string): void {
  const currentHref = getCurrentHref()
  if (currentHref === href) {
    // The address already shows the target URL (same-URL navigation, or the
    // entry was already pushed). Adopt it as the optimistic entry so the
    // commit reconciles against it instead of pushing a duplicate.
    optimisticHistoryEntryHref = href
    return
  }
  if (
    optimisticHistoryEntryHref !== null &&
    optimisticHistoryEntryHref === currentHref
  ) {
    // Repurpose the still-current optimistic entry of a navigation that
    // hasn't committed yet, instead of stacking a ghost entry for a URL the
    // user never committed to.
    window.history.replaceState({ __NA: true }, '', href)
  } else {
    window.history.pushState({ __NA: true }, '', href)
  }
  optimisticHistoryEntryHref = href
}

/**
 * If the tracked optimistic entry is still the current history entry,
 * clear the tracking and return true. HistoryUpdater uses this to decide
 * whether the current entry is safe to repurpose with replaceState (when
 * the committed URL differs) instead of pushing a new entry.
 */
export function consumeOptimisticHistoryEntryIfCurrent(): boolean {
  if (
    optimisticHistoryEntryHref !== null &&
    optimisticHistoryEntryHref === getCurrentHref()
  ) {
    optimisticHistoryEntryHref = null
    return true
  }
  return false
}
