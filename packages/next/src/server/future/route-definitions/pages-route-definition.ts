import type { RouteDefinition } from './route-definition'

import {
  isLocaleRouteDefinition,
  type LocaleRouteDefinition,
} from './locale-route-definition'
import { RouteKind } from '../route-kind'

export interface PagesRouteDefinition
  extends RouteDefinition<RouteKind.PAGES> {}

export function isPagesRouteDefinition(
  definition: RouteDefinition
): definition is PagesRouteDefinition {
  return definition.kind === RouteKind.PAGES
}

export interface PagesLocaleRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES> {}

export function isPagesLocaleRouteDefinition(
  definition: RouteDefinition
): definition is PagesLocaleRouteDefinition {
  return (
    isPagesRouteDefinition(definition) && isLocaleRouteDefinition(definition)
  )
}
