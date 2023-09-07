import type { LocaleRouteDefinition } from './locale-route-definition'
import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export interface PagesRouteDefinition
  extends RouteDefinition<RouteKind.PAGES>,
    RouteDefinition<RouteKind.PAGES> {}

export interface PagesLocaleRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES>,
    RouteDefinition<RouteKind.PAGES> {}

export function isPagesRouteDefinition(
  definition: RouteDefinition
): definition is PagesRouteDefinition {
  return definition.kind === RouteKind.PAGES
}
