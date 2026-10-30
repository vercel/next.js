import type { RouteMatch } from './route-match'
import type { PagesAPIRouteIdentity } from '../route-definitions/pages-api-route-definition'
import type { RouteIdentity } from '../route-definitions/route-definition'

import { RouteKind } from '../route-kind'

export interface PagesAPIRouteMatch extends RouteMatch<PagesAPIRouteIdentity> {}

/**
 * Checks if the given match is a Pages API route match.
 * @param match the match to check
 * @returns true if the match is a Pages API route match, false otherwise
 */
export function isPagesAPIRouteMatch<D extends RouteIdentity>(
  match: RouteMatch<D>
): match is RouteMatch<D & PagesAPIRouteIdentity> {
  return match.definition.kind === RouteKind.PAGES_API
}
