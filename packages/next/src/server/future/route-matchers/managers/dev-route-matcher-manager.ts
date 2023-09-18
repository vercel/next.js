import type { NormalizedMatchOptions } from '../../normalizers/match-options-normalizer'
import type { RouteMatch } from '../../route-matches/route-match'
import type { RouteMatcher } from '../route-matcher'

import { RouteKind } from '../../route-kind'
import { BaseRouteMatcherManager } from './base-route-matcher-manager'

export class DevRouteMatcherManager extends BaseRouteMatcherManager {
  protected validate(
    matcher: RouteMatcher,
    normalized: NormalizedMatchOptions
  ): RouteMatch | null {
    const match = super.validate(matcher, normalized)

    // If a match was found, check to see if there were any conflicting app or
    // pages files.
    // TODO: maybe expand this to _any_ duplicated routes instead?
    if (
      match &&
      matcher.duplicated &&
      matcher.duplicated.some(
        (duplicate) =>
          duplicate.definition.kind === RouteKind.APP_PAGE ||
          duplicate.definition.kind === RouteKind.APP_ROUTE
      ) &&
      matcher.duplicated.some(
        (duplicate) =>
          duplicate.definition.kind === RouteKind.PAGES ||
          duplicate.definition.kind === RouteKind.PAGES_API
      )
    ) {
      return null
    }

    return match
  }
}
