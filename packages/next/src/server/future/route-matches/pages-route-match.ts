import type {
  PagesLocaleRouteDefinition,
  PagesRouteDefinition,
} from '../route-definitions/pages-route-definition'
import type { LocaleRouteMatch } from './locale-route-match'
import { RouteMatch } from './route-match'

export interface PagesLocaleRouteMatch
  extends LocaleRouteMatch<PagesLocaleRouteDefinition> {}

export interface PagesRouteMatch extends RouteMatch<PagesRouteDefinition> {}
