import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import type { RouteTree } from '../segment-cache/cache'

export function isNavigatingToNewRootLayout(
  currentTree: FlightRouterState,
  nextTree: RouteTree
): boolean {
  // Compare segments
  const currentTreeSegment = currentTree[0]
  const nextTreeSegment = nextTree.segment

  // If any segment is different before we find the root layout, the root layout has changed.
  // E.g. /same/(group1)/layout.js -> /same/(group2)/layout.js
  // First segment is 'same' for both, keep looking. (group1) changed to (group2) before the root layout was found, it must have changed.
  if (Array.isArray(currentTreeSegment) && Array.isArray(nextTreeSegment)) {
    // Compare dynamic param name and type but ignore the value, different values would not affect the current root layout
    // /[name] - /slug1 and /slug2, both values (slug1 & slug2) still has the same layout /[name]/layout.js
    if (
      currentTreeSegment[0] !== nextTreeSegment[0] ||
      currentTreeSegment[2] !== nextTreeSegment[2]
    ) {
      return true
    }
  } else if (currentTreeSegment !== nextTreeSegment) {
    return true
  }

  // Current tree root layout found
  if (currentTree[4]) {
    // If the next tree doesn't have the root layout flag, it must have changed.
    return !nextTree.isRootLayout
  }
  // Current tree didn't have its root layout here, must have changed.
  if (nextTree.isRootLayout) {
    return true
  }

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
