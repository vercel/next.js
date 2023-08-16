import { RouteKind } from '../route-kind'
import { LocaleRouteDefinition } from './locale-route-definition'

export interface PagesRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES> {}
