import type { RouteMatch } from './route-match'
import type { AppRouteRouteDefinition } from '../route-definitions/app-route-route-definition'

export interface AppRouteRouteMatch
  extends RouteMatch<AppRouteRouteDefinition> {}
