import { PagesRouteDefinition } from '../route-definitions/pages-route-definition'
import { LocaleRouteMatch } from './locale-route-match'

export interface PagesRouteMatch
  extends LocaleRouteMatch<PagesRouteDefinition> {}
