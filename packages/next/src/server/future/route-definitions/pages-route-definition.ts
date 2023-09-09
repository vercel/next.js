import {
  isLocaleRouteDefinition,
  type LocaleRouteDefinition,
} from './locale-route-definition'
import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export interface PagesRouteDefinition
  extends RouteDefinition<RouteKind.PAGES> {}

export interface PagesLocaleRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES> {}

export function isPagesLocaleRouteDefinition(
  definition: RouteDefinition
): definition is PagesLocaleRouteDefinition {
  return (
    definition.kind === RouteKind.PAGES && isLocaleRouteDefinition(definition)
  )
}
