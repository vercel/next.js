import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export interface AppPageRouteDefinition
  extends RouteDefinition<RouteKind.APP_PAGE> {
  readonly appPaths: ReadonlyArray<string>
}

export interface AppPageInterceptingRouteDefinition
  extends AppPageRouteDefinition {
  readonly interceptingRoute: string

  /**
   * The pathname (including dynamic placeholders) for a route to resolve that
   * is used for the browser to display in the address bar. This is used in
   * place of `pathname` when the route is rendering.
   *
   * For intercepting routes, this should be the original pathname including
   * the interception route markers (`(..)(..)`, `(..)`, and `(...)`).
   */
  readonly pathnameOverride: string
}

export function isAppPageRouteDefinition(
  definition: RouteDefinition
): definition is AppPageRouteDefinition {
  return definition.kind === RouteKind.APP_PAGE
}
