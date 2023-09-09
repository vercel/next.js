import type { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'

import { PagesAPIRouteMatcher } from '../route-matchers/pages-api-route-matcher'
import { DefaultRouteMatcherProvider } from './default-route-matcher-provider'

export class PagesAPIRouteMatcherProvider extends DefaultRouteMatcherProvider<
  PagesAPIRouteDefinition,
  PagesAPIRouteMatcher
> {
  protected transform(
    definition: PagesAPIRouteDefinition
  ): PagesAPIRouteMatcher {
    return new PagesAPIRouteMatcher(definition)
  }
}
