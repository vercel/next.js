import type {
  PagesLocaleRouteDefinition,
  PagesRouteDefinition,
} from '../route-definitions/pages-route-definition'

import { DefaultRouteMatcher } from './default-route-matcher'
import { LocaleRouteMatcher } from './locale-route-matcher'

export class PagesRouteMatcher extends DefaultRouteMatcher<PagesRouteDefinition> {}

export class PagesLocaleRouteMatcher extends LocaleRouteMatcher<PagesLocaleRouteDefinition> {}
