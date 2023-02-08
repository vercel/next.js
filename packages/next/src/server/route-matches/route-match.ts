import { Params } from '../../shared/lib/router/utils/route-matcher'
import { RouteKind } from '../route-kind'
import { RouteDefinition } from '../route-matchers/route-matcher'

/**
 * RouteMatch is the resolved match for a given request. This will contain all
 * the dynamic parameters used for this route.
 */
export interface RouteMatch<K extends RouteKind> extends RouteDefinition<K> {
  /**
   * params when provided are the dynamic route parameters that were parsed from
   * the incoming request pathname. If a route match is returned without any
   * params, it should be considered a static route.
   */
  readonly params?: Params
}

export function isRouteMatchKind<K extends RouteKind>(
  match: RouteMatch<RouteKind>,
  kind: K
): match is RouteMatch<K> {
  return match.kind === kind
}
