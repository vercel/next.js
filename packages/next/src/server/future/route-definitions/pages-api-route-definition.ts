import { RouteKind } from '../route-kind'
import { LocaleRouteDefinition } from './locale-route-definition'

export interface PagesAPIRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES_API> {}
