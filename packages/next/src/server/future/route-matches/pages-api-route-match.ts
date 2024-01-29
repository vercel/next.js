import type { RouteMatch } from './route-match'
import type { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'

import { RouteKind } from '../route-kind'

export interface PagesAPIRouteMatch
  extends RouteMatch<PagesAPIRouteDefinition> {}

/**
 * Checks if the given match is a Pages API route match.
 * @param match the match to check
 * @returns true if the match is a Pages API route match, false otherwise
 */
export function isPagesAPIRouteMatch(
  match: RouteMatch
): match is PagesAPIRouteMatch {
  return match.definition.kind === RouteKind.PAGES_API
}
