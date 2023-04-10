import type { RouteMatch } from './route-match'
import type {
  AppPageInterceptingRouteDefinition,
  AppPageRouteDefinition,
} from '../route-definitions/app-page-route-definition'

export interface AppPageRouteMatch extends RouteMatch<AppPageRouteDefinition> {}

export interface AppPageInterceptingRouteMatch
  extends RouteMatch<AppPageInterceptingRouteDefinition> {}
