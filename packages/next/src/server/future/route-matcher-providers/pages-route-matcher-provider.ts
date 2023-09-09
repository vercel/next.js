import {
  isPagesLocaleRouteDefinition,
  type PagesLocaleRouteDefinition,
  type PagesRouteDefinition,
} from '../route-definitions/pages-route-definition'

import {
  PagesLocaleRouteMatcher,
  PagesRouteMatcher,
} from '../route-matchers/pages-route-matcher'
import { DefaultRouteMatcherProvider } from './default-route-matcher-provider'

export class PagesRouteMatcherProvider extends DefaultRouteMatcherProvider<
  PagesRouteDefinition | PagesLocaleRouteDefinition,
  PagesRouteMatcher | PagesLocaleRouteMatcher
> {
  protected transform(
    definition: PagesRouteDefinition | PagesLocaleRouteDefinition
  ): PagesRouteMatcher | PagesLocaleRouteMatcher {
    if (isPagesLocaleRouteDefinition(definition)) {
      return new PagesLocaleRouteMatcher(definition)
    }

    return new PagesRouteMatcher(definition)
  }
}
