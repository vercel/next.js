import type { RouteMatch } from './route-match'
import type { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'

export interface PagesAPIRouteMatch
  extends RouteMatch<PagesAPIRouteDefinition> {}
