import type { PagesRouteDefinition } from '../route-definitions/pages-route-definition'
import { LocaleRouteMatcher } from './locale-route-matcher'
import { RouteMatcher } from './route-matcher'

export class PagesRouteMatcher extends RouteMatcher<PagesRouteDefinition> {}

export class PagesLocaleRouteMatcher extends LocaleRouteMatcher<PagesRouteDefinition> {}
