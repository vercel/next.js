import type { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'

import { DefaultRouteMatcher } from './default-route-matcher'

export class PagesAPIRouteMatcher extends DefaultRouteMatcher<PagesAPIRouteDefinition> {}
