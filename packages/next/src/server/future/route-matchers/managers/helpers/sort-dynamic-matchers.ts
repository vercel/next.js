import { getSortedRoutes } from '../../../../../shared/lib/router/utils'
import { RouteMatcher } from '../../route-matcher'

/**
 * sortDynamicMatchers sorts the given dynamic matchers by their pathnames
 * according to the rules of `getSortedRoutes`.
 *
 * @param matchers the matchers to sort
 * @returns the sorted matchers
 */
export function sortDynamicMatchers(
  matchers: ReadonlyArray<RouteMatcher>
): ReadonlyArray<RouteMatcher> {
  // As `getSortedRoutes` only takes an array of strings, we need to create
  // a map of the pathnames (used for sorting) and the matchers. When we
  // have locales, there may be multiple matches for the same pathname. To
  // handle this, we keep a map of all the indexes (in `reference`) and
  // merge them in later.

  const reference = new Map<string, number[]>()
  const pathnames = new Array<string>()
  for (let index = 0; index < matchers.length; index++) {
    // Grab the pathname from the definition.
    const pathname = matchers[index].definition.pathname

    // Grab the index in the dynamic array, push it into the reference.
    let indexes = reference.get(pathname)
    if (!indexes) {
      // If we couldn't get a reference for this then this is the first
      // time we've seen this pathname, so create a new array and set it. We
      // mutate the array later, so we don't need to set it again as it's
      // a reference.
      indexes = []
      reference.set(pathname, indexes)

      // Push the pathname into the array of pathnames.
      pathnames.push(pathname)
    }
    indexes.push(index)
  }

  // Sort the array of pathnames.
  const sorted = getSortedRoutes(pathnames)

  // For each of the sorted pathnames, iterate over them, grabbing the list
  // of indexes and merging them back into the new `sortedDynamicMatchers`
  // array. The order of the same matching pathname doesn't matter because
  // they will have other matching characteristics (like the locale) that
  // is considered.
  const sortedDynamicMatchers: Array<RouteMatcher> = []
  for (const pathname of sorted) {
    const indexes = reference.get(pathname)
    if (!Array.isArray(indexes)) {
      throw new Error('Invariant: expected to find identity in indexes map')
    }

    const dynamicMatches = indexes.map((index) => matchers[index])

    sortedDynamicMatchers.push(...dynamicMatches)
  }

  return sortedDynamicMatchers
}
