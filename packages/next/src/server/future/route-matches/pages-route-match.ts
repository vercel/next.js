import type {
  PagesLocaleRouteDefinition,
  PagesRouteDefinition,
} from '../route-definitions/pages-route-definition'
import type { LocaleRouteMatch } from './locale-route-match'
import type { RouteMatch } from './route-match'

export interface PagesRouteMatch extends RouteMatch<PagesRouteDefinition> {}

export interface PagesLocaleRouteMatch
  extends LocaleRouteMatch<PagesLocaleRouteDefinition> {}
