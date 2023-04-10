import { RouteMatch } from './route-match'
import { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'

export interface PagesAPIRouteMatch
  extends RouteMatch<PagesAPIRouteDefinition> {}
