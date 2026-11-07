import type {
  LocaleRouteDefinition,
  LocaleRouteIdentity,
} from './locale-route-definition'
import type { RouteKind } from '../route-kind'

export interface PagesRouteIdentity
  extends LocaleRouteIdentity<RouteKind.PAGES> {}

export interface PagesRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES>,
    PagesRouteIdentity {}
