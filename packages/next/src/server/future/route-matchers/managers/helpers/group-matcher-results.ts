import { RouteDefinition } from '../../../route-definitions/route-definition'
import { RouteMatcher } from '../../route-matcher'

/**
 * Matchers keyed by their pathname. There may be multiple matchers for the same
 * pathname, so the value is an array of matchers.
 */
type GroupedMatcherResults<D extends RouteDefinition> = ReadonlyMap<
  string,
  ReadonlyArray<RouteMatcher<D>>
>

/**
 * This will group the given matchers into two groups: all and duplicates.
 *
 * @param matchers the matchers to group
 * @returns the grouped matchers
 */
export function groupMatcherResults<D extends RouteDefinition>(
  matchers: ReadonlyArray<RouteMatcher<D>>
): GroupedMatcherResults<D> {
  const all = new Map<string, RouteMatcher<D>[]>()

  for (const matcher of matchers) {
    // Reset duplicated matches when reloading from pages conflicting state.
    if (matcher.duplicated) delete matcher.duplicated

    // Test to see if the matcher being added is a duplicate.
    let matched = all.get(matcher.definition.pathname)
    if (!matched) {
      // There was no match, so create a new array with the matcher in it.
      // Then add this array reference to the all map.
      matched = []
      all.set(matcher.definition.pathname, matched)
    }

    // Push the new matcher into the array of matchers and set the array
    matched.push(matcher)
  }

  return all
}
