import type { RouteKind } from '../route-kind'
import type { RouteDefinition } from './route-definition'

export interface PagesAPIRouteDefinition
  extends RouteDefinition<RouteKind.PAGES_API> {}
