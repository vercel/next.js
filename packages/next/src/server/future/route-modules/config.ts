import type { AppRouteConfig } from './app-route/module'
import type { PagesRouteConfig } from './pages/module'

/**
 * The configuration for any route module. This includes all the keys that are
 * needed for any of the available route modules. This should be updated as new
 * route modules are added.
 */
export type RouteModuleConfig = AppRouteConfig & PagesRouteConfig
