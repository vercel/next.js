import type { RouteKind } from '../route-kind'
import type { LocaleRouteDefinition } from './locale-route-definition'

export interface PagesAPIRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES_API> {}
