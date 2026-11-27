import type { RouteKind } from '../route-kind'
import type { RouteDefinition, RouteIdentity } from './route-definition'

export interface AppRouteRouteIdentity
  extends RouteIdentity<RouteKind.APP_ROUTE> {}

export interface AppRouteRouteDefinition
  extends RouteDefinition<RouteKind.APP_ROUTE>,
    AppRouteRouteIdentity {}
