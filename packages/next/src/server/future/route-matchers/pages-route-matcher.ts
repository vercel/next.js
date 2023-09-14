import type {
  PagesLocaleRouteDefinition,
  PagesRouteDefinition,
} from '../route-definitions/pages-route-definition'

import { BaseRouteMatcher } from './base-route-matcher'
import { LocaleRouteMatcher } from './locale-route-matcher'

export class PagesRouteMatcher extends BaseRouteMatcher<PagesRouteDefinition> {}

export class PagesLocaleRouteMatcher extends LocaleRouteMatcher<PagesLocaleRouteDefinition> {}
