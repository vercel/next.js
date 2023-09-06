import type { RouteDefinition } from '../route-definitions/route-definition'
import { RouteMatch } from './route-match'

export interface InvokedRouteMatch<D extends RouteDefinition = RouteDefinition>
  extends RouteMatch<D> {
  readonly matchedOutputPathname: string
}

export function extendInvokedRouteMatch<
  D extends RouteDefinition,
  R extends InvokedRouteMatch<D>
>(
  routeMatch: RouteMatch<D>,
  matchedOutputPathname: R['matchedOutputPathname']
): R {
  return {
    ...routeMatch,
    matchedOutputPathname,
  } as R
}

export function isInvokedRouteMatch(
  routeMatch: RouteMatch
): routeMatch is InvokedRouteMatch {
  return (
    'matchedOutputPathname' in routeMatch &&
    typeof routeMatch.matchedOutputPathname === 'string'
  )
}
