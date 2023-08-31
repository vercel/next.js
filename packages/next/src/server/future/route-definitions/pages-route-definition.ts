import type { LocaleRouteDefinition } from './locale-route-definition'
import type { RouteDefinition } from './route-definition'
import type { RouteKind } from '../route-kind'
import type { AMPRouteDefinition } from './amp-route-definition'

export interface PagesRouteDefinition
  extends RouteDefinition<RouteKind.PAGES>,
    AMPRouteDefinition<RouteKind.PAGES> {}

export interface PagesLocaleRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES>,
    AMPRouteDefinition<RouteKind.PAGES> {}
