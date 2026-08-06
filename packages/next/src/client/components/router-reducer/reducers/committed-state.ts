import type { FlightRouterState } from '../../../../shared/lib/app-router-types'

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
