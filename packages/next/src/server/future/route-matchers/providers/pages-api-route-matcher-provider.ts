import type { PagesAPIRouteDefinition } from '../../route-definitions/pages-api-route-definition'

import { PagesAPIRouteMatcher } from '../pages-api-route-matcher'
import { BaseRouteMatcherProvider } from './base-route-matcher-provider'

export class PagesAPIRouteMatcherProvider extends BaseRouteMatcherProvider<
  PagesAPIRouteDefinition,
  PagesAPIRouteMatcher
> {
  protected transform(
    definitions: ReadonlyArray<PagesAPIRouteDefinition>
  ): ReadonlyArray<PagesAPIRouteMatcher> {
    return definitions.map((definition) => new PagesAPIRouteMatcher(definition))
  }
}
