/**
 * A route that can be sorted by specificity.
 */
export type SortableRoute = {
  /**
   * The source page of the route. This represents the original page that's on
   * disk. For example, the `app/[lang]/[...rest]/page.tsx` would have a source
   * page of '/[lang]/[...rest]'.
   */
  readonly sourcePage: string

  /**
   * The page of the route. This represents the final rendered route. For
   * example, the `app/[lang]/[...rest]/page.tsx` that was rendered with a lang
   * value of `en` would have a page of '/en/[...rest]'.
   */
  readonly page: string
}

/**
 * Determines the specificity of a route segment for sorting purposes.
 *
 * In Next.js routing, more specific routes should match before less specific ones.
 * This function returns a numeric value where lower numbers indicate higher specificity.
 *
 * Specificity order (most to least specific):
 * 1. Static segments (e.g., "about", "api") - return 0
 * 2. Dynamic segments (e.g., "[id]", "[slug]") - return 1
 * 3. Catch-all segments (e.g., "[...slug]") - return 2
 * 4. Optional catch-all segments (e.g., "[[...slug]]") - return 3
 *
 * @param segment - A single path segment (e.g., "api", "[id]", "[...slug]")
 * @returns A numeric specificity value (0-3, where 0 is most specific)
 */
export function getSegmentSpecificity(segment: string): number {
  // Static segments are most specific - they match exactly one path
  if (!segment.includes('[')) {
    return 0
  }

  // Optional catch-all [[...param]] is least specific - matches zero or more segments
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return 3
  }

  // Catch-all [...param] is less specific - matches one or more segments
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return 2
  }

  // Regular dynamic [param] is more specific than catch-all - matches exactly one segment
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return 1
  }

  // Default to static (fallback case)
  return 0
}

/**
 * Compares two route paths using a depth-first traversal approach.
 *
 * This function implements a deterministic comparison that sorts routes by specificity:
 * 1. More specific routes come first (fewer dynamic segments)
 * 2. Shorter routes are more specific than longer ones
 * 3. Routes with same specificity are sorted lexicographically
 *
 * The comparison is done segment by segment, left to right, similar to how
 * you would traverse a route tree in depth-first order.
 *
 * @param pathA - First route path to compare (e.g., "/api/users/[id]")
 * @param pathB - Second route path to compare (e.g., "/api/[...slug]")
 * @returns Negative if pathA is more specific, positive if pathB is more specific, 0 if equal
 */
export function compareRouteSegments(pathA: string, pathB: string): number {
  // Split paths into segments, removing empty strings from leading/trailing slashes
  const segmentsA = pathA.split('/').filter(Boolean)
  const segmentsB = pathB.split('/').filter(Boolean)

  // Compare segment by segment up to the length of the longer path
  const maxLength = Math.max(segmentsA.length, segmentsB.length)

  for (let i = 0; i < maxLength; i++) {
    const segA = segmentsA[i] || ''
    const segB = segmentsB[i] || ''

    // Handle length differences: shorter routes are MORE specific
    // Example: "/api" is more specific than "/api/users"
    if (!segA && segB) return -1 // pathA is shorter, so more specific
    if (segA && !segB) return 1 // pathB is shorter, so more specific
    if (!segA && !segB) return 0 // Both paths ended, they're equal

    // Compare segment specificity using our specificity scoring
    const specificityA = getSegmentSpecificity(segA)
    const specificityB = getSegmentSpecificity(segB)

    // Lower specificity number = more specific route
    // Example: "api" (0) vs "[slug]" (1) - "api" wins
    if (specificityA !== specificityB) {
      return specificityA - specificityB
    }

    // If segments have same specificity, compare lexicographically for determinism
    // Example: "[id]" vs "[slug]" - "[id]" comes first alphabetically
    if (segA !== segB) {
      return segA.localeCompare(segB)
    }

    // Segments are identical, continue to next segment
  }

  // All segments compared equally
  return 0
}

/**
 * Compares two complete routes for sorting purposes.
 *
 * Routes are compared with a two-tier priority system:
 * 1. Primary: Compare by source path specificity
 * 2. Secondary: If sources are equal, compare by page path specificity
 *
 * This ensures that routes are primarily organized by their source patterns,
 * with page-specific variations grouped together.
 *
 * @param a - First route to compare
 * @param b - Second route to compare
 * @returns Negative if route a should come first, positive if route b should come first, 0 if equal
 */
function compareSortableRoutes(a: SortableRoute, b: SortableRoute): number {
  // First compare by source specificity - this is the primary sorting criterion
  // Source represents the original route pattern and takes precedence
  const sourceResult = compareRouteSegments(a.sourcePage, b.sourcePage)
  if (sourceResult !== 0) return sourceResult

  // If sources are identical, compare by page specificity as a tiebreaker
  // Page represents the final rendered route and provides secondary ordering
  return compareRouteSegments(a.page, b.page)
}

/**
 * Sorts an array of routes by specificity using a deterministic depth-first traversal approach.
 *
 * This function implements Next.js route matching priority where more specific routes
 * should be matched before less specific ones. The sorting is deterministic and stable,
 * meaning identical inputs will always produce identical outputs.
 *
 * Sorting criteria (in order of priority):
 * 1. Source path specificity (primary)
 * 2. Page path specificity (secondary)
 * 3. Lexicographic ordering (tertiary, for determinism)
 *
 * Examples of specificity order:
 * - "/api/users" (static) comes before "/api/[slug]" (dynamic)
 * - "/api/[id]" (dynamic) comes before "/api/[...slug]" (catch-all)
 * - "/api/[...slug]" (catch-all) comes before "/api/[[...slug]]" (optional catch-all)
 *
 * @param routes - Array of routes to sort
 * @returns New sorted array (does not mutate input)
 */
export function sortSortableRoutes(
  routes: readonly SortableRoute[]
): readonly SortableRoute[] {
  // Because sort is always in-place, we need to create a shallow copy to avoid
  // mutating the input array.
  return [...routes].sort(compareSortableRoutes)
}

/**
 * Sorts an array of pages by specificity using a deterministic depth-first
 * traversal approach.
 *
 * @param pages - Array of pages to sort
 * @returns New sorted array (does not mutate input)
 */
export function sortPages(pages: readonly string[]): readonly string[] {
  // Because sort is always in-place, we need to create a shallow copy to avoid
  // mutating the input array.
  return [...pages].sort(compareRouteSegments)
}

/**
 * Sorts an array of objects by sourcePage and page using a deterministic
 * depth-first traversal approach.
 *
 * @param objects - Array of objects to sort
 * @param getter - Function to get the sourcePage and page from an object
 * @returns New sorted array (does not mutate input)
 */
export function sortSortableRouteObjects<T>(
  objects: readonly T[],
  getter: (object: T) => SortableRoute
): readonly T[] {
  // Create a SortableRoute for each object.
  const routes: Array<SortableRoute & { object: T }> = []
  for (const object of objects) {
    const route = getter(object)
    routes.push({ ...route, object })
  }

  // In-place sort the SortableRoutes.
  routes.sort(compareSortableRoutes)

  // Map the sorted SortableRoutes back to the original objects.
  return routes.map(({ object }) => object)
}

/**
 * Sorts an array of objects by page using a deterministic depth-first traversal
 * approach.
 *
 * @param objects - Array of objects to sort
 * @param getter - Function to get the page from an object
 * @returns New sorted array (does not mutate input)
 */
export function sortPageObjects<T>(
  objects: readonly T[],
  getter: (object: T) => string
): readonly T[] {
  const indexes: Record<string, number[]> = {}
  const pages: Set<string> = new Set()
  for (let i = 0; i < objects.length; i++) {
    const object = objects[i]
    const page = getter(object)
    indexes[page]?.push(i) || (indexes[page] = [i])
    pages.add(page)
  }

  // Sort the unique pages.
  const sortedPages = Array.from(pages).sort(compareRouteSegments)

  // Map the sorted pages back to the original objects.
  return sortedPages.reduce<T[]>((sortedObjects, page) => {
    // Add all objects for this page to the sorted array.
    for (const i of indexes[page]) {
      sortedObjects.push(objects[i])
    }

    // Return the sorted array.
    return sortedObjects
  }, [])
}
