import type { RouteKind } from '../route-kind'
import type { LocaleRouteDefinition } from './locale-route-definition'
import type { RouteDefinition } from './route-definition'

export interface PagesRouteDefinition
  extends RouteDefinition<RouteKind.PAGES> {}

export interface PagesLocaleRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES> {}
