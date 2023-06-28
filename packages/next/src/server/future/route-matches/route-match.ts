import type { ParsedUrlQuery } from 'querystring'
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

/**
 * Checks if the route match is the specified route match kind. This can also
 * be used to coerce the match type. Note that for situations where multiple
 * route match types are associated with a given route kind this function will
 * not validate it at runtime.
 *
 * @param match the match to check
 * @param kind the kind to check against
 * @returns true if the route match is of the specified kind
 */
export function isRouteMatch<M extends RouteMatch>(
  match: RouteMatch,
  kind: M['definition']['kind']
): match is M {
  return match.definition.kind === kind
}

/**
 * Converts the query into params.
 *
 * @param query the query to convert to params
 * @returns the params
 */
export function parsedUrlQueryToParams(
  query: ParsedUrlQuery
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'undefined') continue
    params[key] = value
  }

  return params
}
