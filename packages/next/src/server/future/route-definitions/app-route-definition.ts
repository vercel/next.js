import type { AppPageRouteDefinition } from './app-page-route-definition'
import type { AppRouteRouteDefinition } from './app-route-route-definition'
import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export type AppRouteDefinition =
  | AppPageRouteDefinition
  | AppRouteRouteDefinition

export function isAppRouteDefinition(
  definition: RouteDefinition
): definition is AppRouteDefinition {
  return (
    definition.kind === RouteKind.APP_ROUTE ||
    definition.kind === RouteKind.APP_PAGE
  )
}
