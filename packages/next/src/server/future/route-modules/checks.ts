import type { AppRouteRouteModule } from './app-route/module'
import type { AppPageRouteModule } from './app-page/module'
import type { PagesRouteModule } from './pages/module'
import type { PagesAPIRouteModule } from './pages-api/module'

import type { RouteModule } from './route-module'

import { RouteKind } from '../route-kind'

export function isAppRouteRouteModule(
  routeModule: RouteModule
): routeModule is AppRouteRouteModule {
  return routeModule.definition.kind === RouteKind.APP_ROUTE
}

export function isAppPageRouteModule(
  routeModule: RouteModule
): routeModule is AppPageRouteModule {
  return routeModule.definition.kind === RouteKind.APP_PAGE
}

export function isPagesRouteModule(
  routeModule: RouteModule
): routeModule is PagesRouteModule {
  return routeModule.definition.kind === RouteKind.PAGES
}

export function isPagesAPIRouteModule(
  routeModule: RouteModule
): routeModule is PagesAPIRouteModule {
  return routeModule.definition.kind === RouteKind.PAGES_API
}
