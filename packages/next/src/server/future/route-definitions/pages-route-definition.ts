import type { LocaleRouteDefinition } from './locale-route-definition'
import { RouteKind } from '../route-kind'

export interface PagesRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES> {}
