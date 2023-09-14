import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export interface AppRouteRouteDefinition
  extends RouteDefinition<RouteKind.APP_ROUTE> {}

export function isAppRouteRouteDefinition(
  definition: RouteDefinition
): definition is AppRouteRouteDefinition {
  return definition.kind === RouteKind.APP_ROUTE
}
