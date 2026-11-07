import type { RouteKind } from '../route-kind'
import type {
  LocaleRouteDefinition,
  LocaleRouteIdentity,
} from './locale-route-definition'

export interface PagesAPIRouteIdentity
  extends LocaleRouteIdentity<RouteKind.PAGES_API> {}

export interface PagesAPIRouteDefinition
  extends LocaleRouteDefinition<RouteKind.PAGES_API>,
    PagesAPIRouteIdentity {}
