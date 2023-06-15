import type { FlightRouterState } from '../../../server/app-render/types'

export function isNavigatingToNewRootLayout(
  currentTree: FlightRouterState,
  nextTree: FlightRouterState
): boolean {
  // Compare segments
  const currentTreeSegment = currentTree[0]
  const nextTreeSegment = nextTree[0]
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
    return !nextTree[4]
  }
  // Current tree  didn't have its root layout here, must have changed.
  if (nextTree[4]) {
    return true
  }
  // We can't assume it's `parallelRoutes.children` here in case the root layout is `app/@something/layout.js`
  // But it's not possible to be more than one parallelRoutes before the root layout is found
  // TODO-APP: change to traverse all parallel routes
  const currentTreeChild = Object.values(currentTree[1])[0]
  const nextTreeChild = Object.values(nextTree[1])[0]
  if (!currentTreeChild || !nextTreeChild) return true
  return isNavigatingToNewRootLayout(currentTreeChild, nextTreeChild)
}
