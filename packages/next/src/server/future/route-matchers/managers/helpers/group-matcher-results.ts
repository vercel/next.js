import { RouteMatcher } from '../../route-matcher'

type GroupedMatcherResults = {
  /**
   * all is a map of all the matchers, keyed by their pathname. There may be
   * multiple matchers for the same pathname, so the value is an array of
   * matchers.
   */
  readonly all: ReadonlyMap<string, ReadonlyArray<RouteMatcher>>

  /**
   * duplicates is a map of all the duplicate matchers, keyed by their
   * pathname. This will only contain references to those matchers where more
   * than one matcher exists for the same pathname.
   */
  readonly duplicates: ReadonlyMap<string, ReadonlyArray<RouteMatcher>>
}

/**
 * This will group the given matchers into two groups: all and duplicates.
 *
 * @param matchers the matchers to group
 * @returns the grouped matchers
 */
export function groupMatcherResults(
  matchers: ReadonlyArray<RouteMatcher>
): GroupedMatcherResults {
  const all = new Map<string, RouteMatcher[]>()
  const duplicates = new Map<string, RouteMatcher[]>()

  for (const matcher of matchers) {
    // Reset duplicated matches when reloading from pages conflicting state.
    if (matcher.duplicated) delete matcher.duplicated

    // Test to see if the matcher being added is a duplicate.
    let matched = all.get(matcher.definition.pathname)
    if (matched && matched.length > 0) {
      // We got a duplicate! This means that along with the current
      // matcher, there is already a matcher for the same pathname. Let's
      // grab the first one, as all the matchers will share the same
      // array reference anyways.
      const [other] = matched

      // Check to see if this there is already a duplicate array for this
      // pathname. If there is, then we can just push the matcher into it.
      // Otherwise, we need to create a new array with the original
      // duplicate first.
      let others = duplicates.get(matcher.definition.pathname)
      if (!others) {
        // There was no duplicate array, so create a new one with the
        // original duplicate first. Then add this array reference to the
        // duplicates map.
        others = [other]
        duplicates.set(matcher.definition.pathname, others)

        // Add the new reference to the original matcher, this is the
        // first time it's been duplicated.
        other.duplicated = others
      }

      // Push the new matcher into the array of duplicates and set the
      // array reference on the new matcher. This is the first time it's
      // been duplicated.
      others.push(matcher)
      matcher.duplicated = others
      matched.push(matcher)
    } else {
      // There was no match, so create a new array with the matcher in it.
      // Then add this array reference to the all map.
      matched = [matcher]
      all.set(matcher.definition.pathname, matched)
    }
  }

  return { all, duplicates }
}
