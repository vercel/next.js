import type { RouteDefinition } from './route-definition'

import {
  isLocaleRouteDefinition,
  type LocaleRouteInfo,
} from './locale-route-info'
import { RouteKind } from '../route-kind'

export interface PagesRouteDefinition
  extends RouteDefinition<RouteKind.PAGES> {}

export function isPagesRouteDefinition(
  definition: RouteDefinition
): definition is PagesRouteDefinition {
  return definition.kind === RouteKind.PAGES
}

export interface PagesLocaleRouteDefinition
  extends RouteDefinition<RouteKind.PAGES>,
    LocaleRouteInfo {}

export function isPagesLocaleRouteDefinition(
  definition: RouteDefinition
): definition is PagesLocaleRouteDefinition {
  return (
    isPagesRouteDefinition(definition) && isLocaleRouteDefinition(definition)
  )
}
