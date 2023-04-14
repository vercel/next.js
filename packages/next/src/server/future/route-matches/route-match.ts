import type { RouteDefinition } from '../route-definitions/route-definition'

/**
 * RouteMatch is the resolved match for a given request. This will contain all
 * the dynamic parameters used for this route.
 */
export interface RouteMatch<D extends RouteDefinition = RouteDefinition> {
  readonly definition: D

  /**
   * params when provided are the dynamic route parameters that were parsed from
   * the incoming request pathname. If a route match is returned without any
   * params, it should be considered a static route.
   */
  readonly params: Record<string, string | string[]> | undefined
}
