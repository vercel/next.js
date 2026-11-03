import type { RouteKind } from '../route-kind'
import type { RouteDefinition, RouteIdentity } from './route-definition'

export interface AppGoRouteRouteIdentity
  extends RouteIdentity<RouteKind.APP_ROUTE_GO> {}

export interface AppGoRouteRouteDefinition
  extends RouteDefinition<RouteKind.APP_ROUTE_GO>,
    AppGoRouteRouteIdentity {}
