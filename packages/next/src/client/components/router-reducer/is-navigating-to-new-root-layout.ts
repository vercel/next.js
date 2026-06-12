import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import { PrefetchHint } from '../../../shared/lib/app-router-types'
import type { RouteTree } from '../segment-cache/cache'

export function isNavigatingToNewRootLayout(
  currentTree: FlightRouterState,
  nextTree: RouteTree
): boolean {
  // Decides whether navigating from currentTree to nextTree crosses into a
  // different root layout, which requires a full-page (MPA-style) navigation.
  //
  // The "root layout" is the highest-level layout in the tree. The segments at
  // or above it form the "root layout prefix", which the server marks with the
  // IsRootLayoutOrAbove hint. Two routes share a root layout iff their root
  // layout prefixes are structurally identical — same segments (ignoring
  // dynamic param *values*) for the same depth. So we walk the prefix in
  // lockstep and report a change as soon as the prefixes diverge.
  const currentInPrefix =
    ((currentTree[4] ?? 0) & PrefetchHint.IsRootLayoutOrAbove) !== 0
  const nextInPrefix =
    (nextTree.prefetchHints & PrefetchHint.IsRootLayoutOrAbove) !== 0

  // Both trees have descended past the root layout with everything above
  // matching — same root layout.
  if (!currentInPrefix && !nextInPrefix) {
    return false
  }

  // One tree's root layout prefix is deeper than the other's, so the root
  // layout boundary moved — it must have changed.
  // E.g. /[lang]/layout.js -> /[lang]/[region]/layout.js
  if (currentInPrefix !== nextInPrefix) {
    return true
  }

  // Both segments are still inside the root layout prefix. They must match.
  // Compare dynamic param name and type but ignore the value: different values
  // (e.g. /[name] for slug1 vs slug2) still resolve to the same /[name]/layout.
  // E.g. /same/(group1)/layout.js -> /same/(group2)/layout.js: (group1) changed
  // to (group2) inside the prefix, so the root layout changed.
  const currentTreeSegment = currentTree[0]
  const nextTreeSegment = nextTree.segment
  if (Array.isArray(currentTreeSegment) && Array.isArray(nextTreeSegment)) {
    if (
      currentTreeSegment[0] !== nextTreeSegment[0] ||
      currentTreeSegment[2] !== nextTreeSegment[2]
    ) {
      return true
    }
  } else if (currentTreeSegment !== nextTreeSegment) {
    return true
  }

  // Keep walking the prefix. (Above the root layout there is only a `children`
  // slot, but we traverse all slots defensively.)
  const slots = nextTree.slots
  const currentTreeChildren = currentTree[1]
  if (slots !== null) {
    for (const slot in slots) {
      const nextTreeChild = slots[slot]
      const currentTreeChild = currentTreeChildren[slot]
      if (
        currentTreeChild === undefined ||
        isNavigatingToNewRootLayout(currentTreeChild, nextTreeChild)
      ) {
        return true
      }
    }
  }
  return false
}
