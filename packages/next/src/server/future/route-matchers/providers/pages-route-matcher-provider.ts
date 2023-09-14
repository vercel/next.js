import {
  isPagesLocaleRouteDefinition,
  type PagesLocaleRouteDefinition,
  type PagesRouteDefinition,
} from '../../route-definitions/pages-route-definition'

import {
  PagesLocaleRouteMatcher,
  PagesRouteMatcher,
} from '../pages-route-matcher'
import { BaseRouteMatcherProvider } from './base-route-matcher-provider'

export class PagesRouteMatcherProvider extends BaseRouteMatcherProvider<
  PagesRouteDefinition | PagesLocaleRouteDefinition,
  PagesRouteMatcher | PagesLocaleRouteMatcher
> {
  protected transform(
    definitions: ReadonlyArray<
      PagesRouteDefinition | PagesLocaleRouteDefinition
    >
  ): ReadonlyArray<PagesRouteMatcher | PagesLocaleRouteMatcher> {
    return definitions.map((definition) => {
      if (isPagesLocaleRouteDefinition(definition)) {
        return new PagesLocaleRouteMatcher(definition)
      }

      return new PagesRouteMatcher(definition)
    })
  }
}
