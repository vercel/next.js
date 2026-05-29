import type { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'
import { LocaleRouteMatcher } from './locale-route-matcher'
import { RouteMatcher } from './route-matcher'

export class PagesAPIRouteMatcher extends RouteMatcher<PagesAPIRouteDefinition> {}

export class PagesAPILocaleRouteMatcher extends LocaleRouteMatcher<PagesAPIRouteDefinition> {}
