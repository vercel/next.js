import type { PagesRouteDefinition } from '../route-definitions/pages-route-definition'
import type { LocaleRouteMatch } from './locale-route-match'

export interface PagesRouteMatch
  extends LocaleRouteMatch<PagesRouteDefinition> {}
