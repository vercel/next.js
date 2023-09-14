import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export interface PagesAPIRouteDefinition
  extends RouteDefinition<RouteKind.PAGES_API> {}

export function isPagesAPIRouteDefinition(
  definition: RouteDefinition
): definition is PagesAPIRouteDefinition {
  return definition.kind === RouteKind.PAGES_API
}
